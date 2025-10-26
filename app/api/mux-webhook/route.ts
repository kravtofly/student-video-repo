// app/api/mux-webhook/route.ts
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { video } from "@/lib/mux"; // uses MUX_TOKEN_ID/SECRET

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET!;
const TOLERANCE_SECONDS = 300; // 5 minutes

function ok(json: any, status = 200) {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Verify Mux "mux-signature" header (t=<ts>, v1=<hex>) */
function verifyMuxSignature(raw: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = sigHeader.split(",").map((s) => s.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!t || !v1) return false;

  const payload = `${t}.${raw}`;
  const expectedHex = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  // timingSafeEqual requires ArrayBufferView, convert Buffers to Uint8Array views
  const aBuf = Buffer.from(expectedHex, "hex");
  const bBuf = Buffer.from(v1, "hex");
  if (aBuf.length !== bBuf.length) return false;
  const a = new Uint8Array(aBuf.buffer, aBuf.byteOffset, aBuf.byteLength);
  const b = new Uint8Array(bBuf.buffer, bBuf.byteOffset, bBuf.byteLength);
  if (!crypto.timingSafeEqual(a, b)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > TOLERANCE_SECONDS) return false;

  return true;
}

async function ensureSignedPlaybackId(assetId: string): Promise<string | null> {
  const asset: any = await video.assets.retrieve(assetId);
  let signed = asset?.playback_ids?.find((p: any) => p.policy === "signed")?.id ?? null;
  if (!signed) {
    const pb: any = await video.assets.createPlaybackId(assetId, { policy: "signed" });
    signed = pb?.id ?? null;
  }
  return signed;
}

/**
 * Update the row created at /api/create-upload (match by upload_id first),
 * else fall back to upsert by asset_id.
 * Only patch fields we actually have (no mass null overwrites).
 */
async function writeByUploadOrAsset(params: {
  uploadId?: string | null;
  assetId: string;
  status?: string;
  playbackId?: string | null;
}) {
  const { uploadId, assetId, status, playbackId } = params;

  const patch: Record<string, any> = { asset_id: assetId };
  if (typeof status === "string") patch.status = status;
  if (typeof playbackId !== "undefined") patch.playback_id = playbackId;

  // 1) Try update by upload_id (preferred path – matches the row we created in create-upload)
  if (uploadId) {
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("videos")
      .update(patch)
      .eq("upload_id", uploadId)
      .select("id");

    if (!upErr && updated && updated.length > 0) return true;
    if (upErr) console.error("webhook: update-by-upload_id error:", upErr);
  }

  // 2) Fall back to upsert by asset_id (in case the initial upsert was missed)
  const { error: insErr } = await supabaseAdmin
    .from("videos")
    .upsert({ upload_id: uploadId ?? null, ...patch }, { onConflict: "asset_id" });

  if (insErr) console.error("webhook: upsert-by-asset_id error:", insErr);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!WEBHOOK_SECRET) return ok({ error: "webhook secret not configured" }, 500);

    const raw = await req.text();
    const sig = req.headers.get("mux-signature") || req.headers.get("Mux-Signature");
    if (!verifyMuxSignature(raw, sig, WEBHOOK_SECRET)) {
      return ok({ error: "invalid signature" }, 400);
    }

    const evt = JSON.parse(raw) as { type: string; data: any; object?: any };
    const { type, data, object } = evt;

    // Parse passthrough (support both old long keys and new short keys)
    let meta: any = {};
    try {
      meta = data?.passthrough ? JSON.parse(data.passthrough) : {};
    } catch {
      /* ignore */
    }

    // Ignore comment uploads (audio/video coach feedback)
    if (meta.type === 'comment') {
      console.log('[mux-webhook] Ignoring comment upload:', { type, uploadId: data?.upload_id });
      return ok({ ok: true, handled: 'ignored_comment', type });
    }

    const reviewOrderId: string | null = meta.reviewOrderId ?? meta.r ?? null;
    const uploadToken: string | null = meta.uploadToken ?? meta.t ?? null;

    // 1) Asset created (either variant)
    if (type === "video.upload.asset_created" || type === "video.asset.created") {
      const uploadId: string | undefined =
        object?.type === "upload" ? object?.id : data?.upload_id;
      const assetId: string | undefined = data?.asset_id ?? data?.id;

      if (assetId) {
        let signedPid: string | null = null;
        try {
          signedPid = await ensureSignedPlaybackId(assetId);
        } catch (e) {
          console.warn("ensureSignedPlaybackId(created) failed:", e);
        }

        await writeByUploadOrAsset({
          uploadId,
          assetId,
          status: "processing",
          playbackId: signedPid,
        });
      }

      return ok({ ok: true, handled: type, reviewOrderId, uploadToken });
    }

    // 2) Asset ready
    if (type === "video.asset.ready") {
      const assetId: string | undefined = data?.id ?? data?.asset_id;
      if (assetId) {
        let signedPid: string | null = null;
        try {
          signedPid = await ensureSignedPlaybackId(assetId);
        } catch (e) {
          console.warn("ensureSignedPlaybackId(ready) failed:", e);
        }

        // We know asset_id now; update status+playback
        const { error } = await supabaseAdmin
          .from("videos")
          .update({ status: "ready", playback_id: signedPid })
          .eq("asset_id", assetId);

        if (error) console.error("webhook: update status=ready error:", error);
      }
      return ok({ ok: true, handled: "video.asset.ready", reviewOrderId, uploadToken });
    }

    // Ignore other events
    return ok({ ok: true, handled: "ignored", type });
  } catch (err: any) {
    console.error("mux-webhook error:", err?.message || err);
    // Still return 2xx so Mux doesn’t retry forever. Logs will show details.
    return ok({ ok: true, note: "handled with error" });
  }
}
