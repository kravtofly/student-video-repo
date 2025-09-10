import { NextRequest, NextResponse } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";
export const runtime = "nodejs";

const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim());

function cors(origin: string) {
  const h = new Headers();
  if (allowed.includes(origin) || origin.endsWith(".vercel.app")) {
    h.set("Access-Control-Allow-Origin", origin);
  } else {
    h.set("Access-Control-Allow-Origin", "*"); // temp fallback to unblock
  }
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Vary", "Origin");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: cors(req.headers.get("origin") || "")
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const headers = cors(origin);

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

  return NextResponse.json({ uploadUrl: upload.url, uploadId: upload.id }, { headers });
}
