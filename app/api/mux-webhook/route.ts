// app/api/mux-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { webhooks } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(data: any = { ok: true }) { return NextResponse.json(data); }

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("mux-signature") || req.headers.get("mux-signature-v1") || "";

  let evt: any;
  try {
    evt = webhooks.verify(raw, sig, process.env.MUX_WEBHOOK_SECRET!); // throws if bad
  } catch (e) {
    console.error("Webhook verify failed:", e);
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  try {
    // Handle early link
    if (evt.type === "video.upload.asset_created") {
      const { upload_id, asset_id } = evt.data || {};
      if (upload_id && asset_id) {
        const { error } = await supabaseAdmin
          .from("videos")
          .update({ asset_id, status: "created" })
          .eq("upload_id", upload_id);
        if (error) console.error("SB update created error:", error);
      }
      return ok();
    }

    if (evt.type === "video.asset.ready") {
      const a = evt.data || {};
      const uploadId: string | undefined = a.upload_id;
      const assetId: string = a.id;
      const playbackId: string | undefined = a.playback_ids?.[0]?.id;
      const duration: number | undefined = a.duration;
      let filename: string | undefined;
      try { if (a.passthrough) filename = JSON.parse(a.passthrough)?.filename; } catch {}

      // First try by upload_id (preferred), else by asset_id
      let { data, error } = await supabaseAdmin
        .from("videos")
        .update({
          status: "ready",
          asset_id: assetId,
          playback_id: playbackId ?? null,
          duration: duration ?? null,
          title: filename ?? null,
        })
        .eq("upload_id", uploadId ?? "");

      if (error) console.error("SB update by upload_id error:", error);

      if (!data?.length) {
        const { error: e2 } = await supabaseAdmin
          .from("videos")
          .update({
            status: "ready",
            playback_id: playbackId ?? null,
            duration: duration ?? null,
            title: filename ?? null,
          })
          .eq("asset_id", assetId);
        if (e2) console.error("SB update by asset_id error:", e2);
      }
      return ok();
    }

    return ok(); // ignore other event types
  } catch (e: any) {
    console.error("Webhook handler error:", e?.message || e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
