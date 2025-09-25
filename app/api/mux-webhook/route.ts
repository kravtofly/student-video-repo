// app/api/mux-webhook/route.ts
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { video } from "@/lib/mux"; // uses MUX_TOKEN_ID/SECRET

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET!;
const TOLERANCE_SECONDS = 300; // 5 minutes

const asUUID = (v?: string | null) =>
  !!(v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v))
    ? v
    : null;

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
      uploadId?: string;
      assetId: string;
      status?: string;
      filename?: string | null;
      ownerId?: string | null;
      ownerEmail?: string | null;
      ownerName?: string | null;
      coachId?: string | null;
      labId?: string | null;
      weekNumber?: number | null;
      level?: string | null;
      kind?: string | null;
      disciplines?: string[] | null;
      reviewOrderId?: string | null;
      playbackId?: string | null;
    }) {
      const {
        uploadId,
        assetId,
        status,
        filename,
        ownerId,
        ownerEmail,
        ownerName,
        coachId,
        labId,
        weekNumber,
        level,
        kind,
        disciplines,
        reviewOrderId,
        playbackId,
      } = params;

      if (uploadId) {
        const { data: updated, error: upErr } = await supabaseAdmin
          .from("videos")
          .update({
            asset_id: assetId,
            playback_id: playbackId ?? null,
            status: status ?? null,
            ...(filename ? { filename, title: filename } : {}),
            ...(ownerId ? { owner_id: ownerId } : {}),
            ...(ownerEmail ? { owner_email: ownerEmail } : {}),
            ...(ownerName ? { owner_name: ownerName } : {}),
            ...(coachId ? { coach_id: coachId } : {}),
            ...(labId ? { lab_id: labId } : {}),
            ...(typeof weekNumber === "number" ? { week_number: weekNumber } : {}),
            ...(level ? { level } : {}),
            ...(kind ? { kind } : {}),
            ...(disciplines ? { disciplines } : {}),
            ...(reviewOrderId ? { review_order_id: asUUID(reviewOrderId) } : {}),
          })
          .eq("upload_id", uploadId)
          .select("id");

        if (upErr) {
          console.error("update by upload_id error:", upErr);
        } else if (updated && updated.length > 0) {
          return true;
        }
      }

      const { error: insErr } = await supabaseAdmin
        .from("videos")
        .upsert(
          {
            asset_id: assetId,
            upload_id: uploadId ?? null,
            playback_id: playbackId ?? null,
            status: status ?? null,
            filename: filename ?? null,
            title: filename ?? null,
            owner_id: ownerId ?? null,
            owner_email: ownerEmail ?? null,
            owner_name: ownerName ?? null,
            coach_id: coachId ?? null,
            lab_id: labId ?? null,
            week_number: weekNumber ?? null,
            level: level ?? null,
            kind: kind ?? null,
            disciplines: disciplines ?? null,
            review_order_id: asUUID(reviewOrderId),
          },
          { onConflict: "asset_id" }
        );
      if (insErr) console.error("upsert by asset_id error:", insErr);

      return true;
    }

    // 1) Asset created
    if (type === "video.upload.asset_created" || type === "video.asset.created") {
      const uploadId: string | undefined =
        object?.type === "upload" ? object?.id : data?.upload_id;
      const assetId: string | undefined = data?.asset_id ?? data?.id;

      let meta: any = {};
      try {
        meta = data?.passthrough ? JSON.parse(data.passthrough) : {};
      } catch (e) {
        console.warn("Failed to parse passthrough:", e);
      }

      if (assetId) {
        let signedPid: string | null = null;
        try {
          signedPid = await ensureSignedPlaybackId(assetId);
        } catch (e) {
          console.warn("ensureSignedPlaybackId (created) failed:", e);
        }

        await writeByUploadOrAsset({
          uploadId,
          assetId,
          status: "processing",
          filename: meta.filename ?? null,
          ownerId: meta.userId ?? null,
          ownerEmail: meta.ownerEmail ?? null,
          ownerName: meta.ownerName ?? null,
          coachId: meta.coachId ?? null,
          labId: meta.labId ?? null,
          weekNumber: typeof meta.weekNumber === "number" ? meta.weekNumber : null,
          level: meta.level ?? null,
          kind: meta.kind ?? null,
          disciplines: Array.isArray(meta.disciplines) ? meta.disciplines : null,
          reviewOrderId: meta.reviewOrderId ?? null,
          playbackId: signedPid,
        });
      }

      return ok({ ok: true, handled: type });
    }

    // 2) Asset ready
    if (type === "video.asset.ready") {
      const assetId: string | undefined = data?.id ?? data?.asset_id;
      if (assetId) {
        let signedPid: string | null = null;
        try {
          signedPid = await ensureSignedPlaybackId(assetId);
        } catch (e) {
          console.warn("ensureSignedPlaybackId (ready) failed:", e);
        }

        const { error } = await supabaseAdmin
          .from("videos")
          .update({ status: "ready", playback_id: signedPid })
          .eq("asset_id", assetId);
        if (error) console.error("update status=ready error:", error);

        // (Quietly) check if tied to a review order
        const { data: vrow, error: readErr } = await supabaseAdmin
          .from("videos")
          .select("review_order_id")
          .eq("asset_id", assetId)
          .maybeSingle(); // avoid 406 when zero rows

        if (!readErr && vrow?.review_order_id) {
          await supabaseAdmin
            .from("review_orders")
            .update({ status: "in_review" })
            .eq("id", vrow.review_order_id)
            .in("status", ["paid", "uploading"]);
        }
      }

      return ok({ ok: true, handled: "video.asset.ready" });
    }

    // 3) Asset errored
    if (type === "video.asset.errored") {
      const assetId: string | undefined = data?.id ?? data?.asset_id;
      if (assetId) {
        const { error } = await supabaseAdmin
          .from("videos")
          .update({ status: "errored" })
          .eq("asset_id", assetId);
        if (error) console.error("update status=errored error:", error);
      }
      return ok({ ok: true, handled: "video.asset.errored" });
    }

    // 4) Asset deleted
    if (type === "video.asset.deleted") {
      const assetId: string | undefined = data?.id ?? data?.asset_id;
      if (assetId) {
        const { error } = await supabaseAdmin
          .from("videos")
          .update({ status: "deleted", playback_id: null })
          .eq("asset_id", assetId);
        if (error) console.error("update status=deleted error:", error);
      }
      return ok({ ok: true, handled: "video.asset.deleted" });
    }

    return ok({ ok: true, handled: "ignored", type });
  } catch (err: any) {
    console.error("mux-webhook error:", err?.message || err);
    return ok({ ok: true, note: "handled with error" });
  }
}
