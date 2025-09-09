import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // webhooks should not be cached

export async function POST(req: NextRequest) {
  // Raw body is available in App Router—no special config needed
  const raw = Buffer.from(await req.arrayBuffer());

  // TODO: verify Mux signature in req.headers.get("mux-signature")
  // using process.env.MUX_WEBHOOK_SECRET

  let evt: any;
  try {
    evt = JSON.parse(raw.toString());
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (evt.type === "video.asset.ready") {
    const asset = evt.data;
    await supabaseAdmin
      .from("videos")
      .update({
        status: "ready",
        mux_asset_id: asset.id,
        mux_playback_id: asset.playback_ids?.[0]?.id,
        duration_seconds: asset.duration
      })
      .eq("upload_id", asset.upload_id);
  } else if (evt.type === "video.asset.errored") {
    await supabaseAdmin
      .from("videos")
      .update({ status: "errored" })
      .eq("upload_id", evt.data.upload_id);
  }

  return NextResponse.json({ ok: true });
}
