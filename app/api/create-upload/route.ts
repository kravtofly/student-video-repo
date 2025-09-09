import { NextRequest, NextResponse } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";
// import { getUserId } from "../../../lib/auth";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // const userId = await getUserId(); if (!userId) return NextResponse.json({error:"unauthorized"},{status:401});
  const userId = "REPLACE_WITH_AUTH";
  const { filename } = await req.json();

  const upload = await video.uploads.create({
    cors_origin: "*",
    new_asset_settings: { playback_policy: ["signed"] }
  });

  await supabaseAdmin.from("videos").insert({
    owner_id: userId,
    status: "uploading",
    upload_id: upload.id,
    filename
  });

  return NextResponse.json({ uploadUrl: upload.url, uploadId: upload.id });
}
