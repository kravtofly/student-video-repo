// app/api/mux-webhook/route.ts
import { NextRequest } from "next/server";
import { video, webhooks } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allow(origin?: string) {
  const h = new Headers();
  if (origin === "https://www.kravtofly.com") {
    h.set("Access-Control-Allow-Origin", origin);
  }
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: allow(req.headers.get("origin") || undefined) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || undefined;
  const headers = allow(origin);

  const raw = await req.text();
  const sig =
    req.headers.get("mux-signature") ||
    req.headers.get("mux-signature-v1") ||
    "";

  try {
    webhooks.verify(raw, sig, process.env.MUX_WEBHOOK_SECRET!);
    const evt = JSON.parse(raw);

    if (evt.type === "video.asset.ready") {
      const asset = evt.data;
      const assetId: string = asset.id;
      const playbackId: string | undefined = asset.playback_ids?.[0]?.id;
      const duration: number | undefined = asset.duration;
      const aspect: string | undefined = asset.aspect_ratio;
      const fileTitle: string | undefined = asset.passthrough || undefined;

      // Set the asset "Title" in Mux so the dashboard shows it
      if (fileTitle) {
        await video.assets.update(assetId, { name: fileTitle });
      }

      // Update your DB row created at upload time
      await supabaseAdmin
        .from("videos")
        .update({
          status: "ready",
          asset_id: assetId,
          playback_id: playbackId ?? null,
          duration: duration ?? null,
          aspect_ratio: aspect ?? null,
          title: fileTitle ?? null,
        })
        .eq("upload_id", asset.upload_id);
    }

    return new Response("ok", { headers });
  } catch (err) {
    console.error("mux webhook error", err);
    return new Response("bad signature", { status: 400, headers });
  }
}
