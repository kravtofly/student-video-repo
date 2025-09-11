// /app/api/mux-webhook/route.ts
import { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok() {
  // Mux expects 2xx quickly; keep handler resilient
  return new Response("ok", { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    // NOTE: for a production app, verify the Mux signature header
    const body = await req.json();
    const type = body?.type;

    if (type === "video.upload.asset_created") {
      // link upload -> asset
      const uploadId = body.data?.upload_id;
      const assetId = body.data?.asset_id;
      if (uploadId && assetId) {
        await supabaseAdmin.from("videos")
          .update({ asset_id: assetId })
          .eq("upload_id", uploadId);
      }
      return ok();
    }

    if (type === "video.asset.ready") {
      const asset = body.data;
      const assetId = asset?.id;
      const playbackId = asset?.playback_ids?.[0]?.id || null;
      const duration = asset?.duration ?? null;
      let filename: string | undefined;

      // If we set passthrough at upload time, recover metadata here
      try {
        const p = asset?.passthrough ? JSON.parse(asset.passthrough) : {};
        filename = p?.filename;
      } catch {}

      if (assetId) {
        await supabaseAdmin.from("videos")
          .update({
            status: "ready",
            playback_id: playbackId,
            duration,
            title: filename ?? null
          })
          .eq("asset_id", assetId);
      }
      return ok();
    }

    // Not a type we care about; still 200 so Mux is happy
    return ok();
  } catch {
    return ok();
  }
}

// Preflight (optional)
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
