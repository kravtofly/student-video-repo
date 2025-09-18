import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

// validate uuid
const toUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin === "https://www.kravtofly.com" ? origin : "*");
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
    // create a direct upload with metadata
    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: JSON.stringify({ filename, userId }),
      },
    });
    // only insert a UUID if it is valid; otherwise owner_id will be null
    await supabaseAdmin
      .from("videos")
      .upsert(
        {
          upload_id: upload.id,
          filename: filename ?? null,
          owner_id: toUUID(userId),
          status: "uploading",
          title: filename ?? null,
        },
        { onConflict: "upload_id" }
      );
    return Response.json({ uploadUrl: upload.url, uploadId: upload.id }, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "server error" }), { status: 500, headers });
  }
}
