// app/api/create-upload/route.ts
import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid caching in Edge

const toUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

export async function POST(req: NextRequest) {
  try {
    const { filename, userId } = await req.json();

    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: JSON.stringify({ filename, userId }),
      },
    });

    // upsert so replays don’t 409; only persist owner_id if it’s a valid UUID
    await supabaseAdmin.from("videos").upsert(
      {
        upload_id: upload.id,
        filename: filename ?? null,
        owner_id: toUUID(userId),
        status: "uploading",
        title: filename ?? null,
      },
      { onConflict: "upload_id" }
    );

    return Response.json({ uploadUrl: upload.url, uploadId: upload.id });
  } catch (err: any) {
    console.error("create-upload error", err?.message || err);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
