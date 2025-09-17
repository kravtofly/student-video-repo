// app/api/create-upload/route.ts
import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin");
  const h = new Headers();
  if (origin === "https://www.kravtofly.com" || process.env.NODE_ENV === "development") {
    h.set("Access-Control-Allow-Origin", origin || "*");
  } else {
    h.set("Access-Control-Allow-Origin", "*");
  }
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  try {
    const { filename, userId } = await req.json();

    // carry metadata via passthrough so the webhook can read it later
    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"], // we use signed playback, so no public preview in the dashboard
        passthrough: JSON.stringify({ filename, userId })
      }
    });

    // create a “placeholder” row (or update it if it somehow already exists)
    await supabaseAdmin
      .from("videos")
      .upsert(
        {
          upload_id: upload.id,
          filename: filename ?? null,
          owner_id: userId ?? null,
          status: "uploading"
        },
        { onConflict: "upload_id" }
      );

    return Response.json({ uploadUrl: upload.url, uploadId: upload.id }, { headers });
  } catch (e: any) {
    console.error("create-upload error", e?.message || e);
    return new Response(JSON.stringify({ error: "server error" }), { status: 500, headers });
  }
}
