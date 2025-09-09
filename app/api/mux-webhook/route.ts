import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
// Verify using raw body in Vercel: route segment config below
export const config = { api: { bodyParser: false } };

async function getRawBody(req: Request) { return Buffer.from(await req.arrayBuffer()); }

export async function POST(req: NextRequest) {
  const raw = await getRawBody(req as any);
  const sig = req.headers.get("mux-signature"); // TODO: verify with MUX_WEBHOOK_SECRET

  const evt = JSON.parse(raw.toString());
  if (evt.type === "video.asset.ready") {
    const asset = evt.data;
    await supabaseAdmin.from("videos")
      .update({
        status: "ready",
        mux_asset_id: asset.id,
        mux_playback_id: asset.playback_ids?.[0]?.id,
        duration_seconds: asset.duration
      })
      .eq("upload_id", asset.upload_id);
  }
  if (evt.type === "video.asset.errored") {
    await supabaseAdmin.from("videos").update({ status: "errored" })
      .eq("upload_id", evt.data.upload_id);
  }
  return NextResponse.json({ ok: true });
}
