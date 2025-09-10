import { NextRequest, NextResponse } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";
export const runtime = "nodejs";

function corsHeaders(origin: string) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim());
  const ok = allowed.includes(origin) || origin.endsWith(".vercel.app");
  const h = new Headers();
  if (ok) h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Vary", "Origin");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin") || "") });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

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
