import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // no caching

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  const reqHeaders = req.headers.get("access-control-request-headers") ?? "content-type";
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin); // echo origin
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", reqHeaders);
  h.set("Access-Control-Max-Age", "86400");
  h.set("Vary", "Origin, Access-Control-Request-Headers");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  const headers = corsHeaders(req);
  console.log("CORS OPTIONS /api/create-upload", {
    origin: req.headers.get("origin"),
    allowOrigin: headers.get("Access-Control-Allow-Origin"),
    allowHeaders: headers.get("Access-Control-Allow-Headers"),
  });
  return new Response(null, { status: 204, headers });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  try {
    const { filename, userId } = await req.json();

    const upload = await video.uploads.create({
      cors_origin: "*",
      new_asset_settings: { playback_policy: ["signed"] },
    });

    await supabaseAdmin.from("videos").insert({
      owner_id: userId || "REPLACE_WITH_AUTH",
      status: "uploading",
      upload_id: upload.id,
      filename,
    });

    return Response.json({ uploadUrl: upload.url, uploadId: upload.id }, { headers });
  } catch (e: any) {
    console.error("create-upload error", e?.message || e);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers,
    });
  }
}
