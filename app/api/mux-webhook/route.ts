// app/api/mux-webhook/route.ts
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { video } from "@/lib/mux";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET!;
const TOLERANCE_SECONDS = 300;

const isUUID = (v?: string | null) =>
  !!(v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v));

function verifyMuxSignature(raw: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = sigHeader.split(",").map((s) => s.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!t || !v1) return false;

  const payload = `${t}.${raw}`;
  const expectedHex = crypto.createHmac("sha256", secret).update(payload).digest("hex");

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

function ok(json: any, status = 200) {
  return new Response(JSON.stringify(json), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type ReviewOrder = {
  id: string;
  student_name: string | null;
  student_email: string | null;
  student_user_id?: string | null;
  coach_user_id?: string | null;
  lab_id?: string | null;
  offer_type?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    if (!WEBHOOK_SECRET) return ok({ error: "webhook secret not configured" }, 500);

    const raw = await req.text();
    const sig = req.headers.get("mux-signature") || req.headers.get("Mux-Signature");
    if (!verifyMuxSignature(raw, sig, WEBHOOK_SECRET)) {
      return ok({ error: "invalid signature" }, 400);
    }

    const evt = JSON.parse(raw);
    const type: string = evt?.type ?? "";
    const data: any = evt?.data ?? {};
    const object: any = evt?.object ?? {};

    async function writeByUploadOrAsset(params: {
      uploadId?: string | null;
      assetId: string;
      set: Record<string, any>;
    }) {
      const { uploadId, assetId, set } = params;

      if (uploadId) {
        const { data: updated, error: upErr } = await supabaseAdmin
          .from("videos")
          .update(set)
          .eq("upload_id", uploadId)
          .select("id");

        if (!upErr && updated && updated.length > 0) return true;
        if (upErr) console.error("mux-webhook: update by upload_id error:", upErr);
      }

      const { error: insErr } = await supabaseAdmin
        .from("videos")
        .upsert({ asset_id: assetId, ...set }, { onConflict: "asset_id" });

      if (insErr) console.error("mux-webhook: upsert by asset_id error:", insErr);
      return true;
    }

    // asset created (two variants)
    if (type === "video.upload.asset_created" || type === "video.asset.created") {
      const uploadId: string | undefined =
        object?.type === "upload" ? object?.id : data?.upload_id;
      const assetId: string | undefined = data?.asset_id ?? data?.id;
      if (!assetId) return ok({ ok: true, handled: "ignored_no_asset" });

      let filename: string | null = null;
      let reviewOrderId: string | null = null;
      try {
        const meta = data?.passthrough ? JSON.parse(data.passthrough) : {};
        filename = meta?.filename ?? null;
        reviewOrderId = meta?.reviewOrderId ?? null;
      } catch {
        // ignore
      }

      // Load review order (if present)
      let order: ReviewOrder | null = null;
      if (reviewOrderId) {
        const { data: ro } = await supabaseAdmin
          .from("review_orders")
          .select(
            "id, student_name, student_email, student_user_id, coach_user_id, lab_id, offer_type"
          )
          .eq("id", reviewOrderId)
          .single<ReviewOrder>();
        order = ro || null;
      }

      // Playback id now or later (ok to try here)
      let signedPid: string | null = null;
      try {
        signedPid = await ensureSignedPlaybackId(assetId);
      } catch (e) {
        console.warn("ensureSignedPlaybackId (created) failed:", e);
      }

      const set: Record<string, any> = {
        asset_id: assetId,
        playback_id: signedPid ?? null,
        status: "uploading",                // <-- stay within your CHECK constraint
        review_order_id: reviewOrderId ?? null,
      };
      if (filename) {
        set.filename = filename;
        set.title = filename;
      }
      if (order) {
        set.owner_name = order.student_name ?? null;
        set.owner_email = order.student_email ?? null;
        if (isUUID(order.student_user_id)) set.owner_id = order.student_user_id;
        if (isUUID(order.coach_user_id)) set.coach_id = order.coach_user_id;
        if (order.lab_id) set.lab_id = order.lab_id;
        if (order.offer_type) set.kind = order.offer_type;
      }

      await writeByUploadOrAsset({ uploadId, assetId, set });
      return ok({ ok: true, handled: type });
    }

    // asset ready
    if (type === "video.asset.ready") {
      const assetId: string | undefined = data?.id ?? data?.asset_id;
      if (!assetId) return ok({ ok: true, handled: "ignored_no_asset" });

      let signedPid: string | null = null;
      try {
        signedPid = await ensureSignedPlaybackId(assetId);
      } catch (e) {
        console.warn("ensureSignedPlaybackId (ready) failed:", e);
      }

      const { error } = await supabaseAdmin
        .from("videos")
        .update({ status: "ready", playback_id: signedPid ?? null })
        .eq("asset_id", assetId);

      if (error) console.error("update status=ready error:", error);
      return ok({ ok: true, handled: "video.asset.ready" });
    }

    return ok({ ok: true, handled: "ignored", type });
  } catch (err: any) {
    console.error("mux-webhook error:", err?.message || err);
    return ok({ ok: true, note: "handled with error" });
  }
}
