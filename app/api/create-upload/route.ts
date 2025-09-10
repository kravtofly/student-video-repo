import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";
export const runtime = "nodejs";

// --- TEMP permissive CORS ---
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const { filename, userId } = await req.json();

  const upload = await video.uploads.create({
    cors_origin: "*",
    new_asset_settings: { playback_policy: ["signed"] }
  });

  await supabaseAdmin.from("videos").insert({
    owner_id: userId || "REPLACE_WITH_AUTH",
    status: "uploading",
    upload_id: upload.id,
    filename
  });

  return Response.json({ uploadUrl: upload.url, uploadId: upload.id }, { headers: CORS });
}
