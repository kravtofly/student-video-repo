// app/api/mux-webhook/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { video } from "@/lib/mux"; // needs MUX_TOKEN_ID / MUX_TOKEN_SECRET

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

const WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET!;
const TOLERANCE_SECONDS = 5 * 60; // 5 minutes

function verifyMuxSignature(raw: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  // header: t=TIMESTAMP,v1=HMAC_HEX
  const parts = sigHeader.split(",").map((s) => s.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!t || !v1) return false;

  // expected = HMAC_SHA256(`${t}.${raw}`, secret)
  const payload = `${t}.${raw}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  // timing-safe compare
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  // timestamp tolerance
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

function ok(json: any, status = 200) {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// No CORS preflight needed for server-to-server webhooks; middleware handles /api anyway.
// If you keep an OPTIONS handler, do NOT send wildcard origins.

export async function POST(req: NextRequest) {
  try {
    if (!WEBHOOK_SECRET) {
      console.error("MUX_WEBHOOK_SECRET not configured");
      return ok({ error: "webhook secret not configured" }, 500);
    }

    const raw = await req.text(); // raw body required for verification
    const sig = req.headers.get("mux-signature") || req.headers.get("Mux-Signature");
    if (!verifyMuxSignature(raw, sig, WEBHOOK_SECRET)) {
      return ok({ error: "invalid signature" }, 400);
    }

    const evt = JSON.parse(raw);
    const type: string = evt?.type ?? "";
    const data: any = evt?.data ?? {};
    const object: any = evt?.object ?? {};

    // 1) ASSET CREATED (two variants): link upload -> asset, capture metadata
    if (type === "video.upload.asset_created" || type === "video.asset.created") {
      // Prefer upload.id from the "upload.asset_created" variant; fallback to data.upload_id if present
      const uploadId: string | undefined =
        object?.type === "upload" ? object?.id : data?.upload_id;
      const assetId: string | undefined = data?.asset_id ?? data?.id;

      // Optional passthrough metadata (we set this at new_asset_settings.passthrough)
      let meta: any = {};
      try {
        meta = data?.passthrough ? JSON.parse(data.passthrough) : {};
      } catch (e) {
        console.warn("Failed to parse asset passthrough:", e);
      }

      if (assetId) {
        // Make sure there is a signed playback ID on the asset
        let signedPid: string | null = null;
        try {
          signedPid = await ensureSignedPlaybackId(assetId);
        } catch (e) {
          console.warn("ensureSignedPlaybackId failed:", e);
        }

        // Upsert by asset_id; also write upload_id (if we have it)
        const { error } = await supabaseAdmin.from("videos").upsert(
          {
            asset_id: assetId,
            upload_id: uploadId ?? null,
            filename: meta.filename ?? null,
            title: meta.filename ?? null,
            owner_id: asUUID(meta.userId),
            status: "processing",
            playback_id: signedPid, // may be null if API failed; ready event will try again
          },
          { onConflict: "asset_id" }
        );
        if (error) {
          console.error("Supabase upsert error (asset.created):", error);
        }
      }

      return ok({ ok: true, handled: type });
    }

    // 2) ASSET READY: ensure signed playback id and mark ready
    if (type === "video.asset.ready") {
      const assetId: string | undefined = data?.id ?? data?.asset_id;
      if (assetId) {
        let signedPid: string | null = null;
        try {
          signedPid = await ensureSignedPlaybackId(assetId);
        } catch (e) {
          console.warn("ensureSignedPlaybackId failed (ready):", e);
        }

        const { error } = await supabaseAdmin
          .from("videos")
          .update({ status: "ready", playback_id: signedPid })
          .eq("asset_id", assetId);

        if (error) {
          console.error("Supabase update error (asset.ready):", error);
        }
      }

      return ok({ ok: true, handled: "video.asset.ready" });
    }

    // Ignore other events
    return ok({ ok: true, handled: "ignored", type });
  } catch (err: any) {
    console.error("mux-webhook error:", err?.message || err);
    // Return 200 to avoid infinite retries; logs still capture the issue.
    return ok({ ok: true, note: "handled with error" });
  }
}
