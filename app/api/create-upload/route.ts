import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // no caching

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin");
  const h = new Headers();
  
  // Allow specific origins or all origins for development
  if (origin === "https://www.kravtofly.com" || process.env.NODE_ENV === "development") {
    h.set("Access-Control-Allow-Origin", origin || "*");
  } else {
    h.set("Access-Control-Allow-Origin", "*"); // or be more restrictive
  }
  
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
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
  cors_origin: "https://www.kravtofly.com",
  new_asset_settings: {
    playback_policy: ["signed"],                 // we want signed playback
    passthrough: JSON.stringify({ filename, userId }), // carry metadata to the webhook
  },
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
