// app/api/create-upload/route.ts
import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // no caching

// --- CORS helpers ------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  "https://www.kravtofly.com",
  "https://kravtofly.com",
]);

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const h = new Headers();

  if (ALLOWED_ORIGINS.has(origin) || process.env.NODE_ENV === "development") {
    h.set("Access-Control-Allow-Origin", origin || "*");
  } else {
    // Default to your primary domain (keeps browsers happy and tightens surface)
    h.set("Access-Control-Allow-Origin", "https://www.kravtofly.com");
  }

  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  const headers = corsHeaders(req);
  return new Response(null, { status: 204, headers });
}

// --- POST /api/create-upload -------------------------------------------------
export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  try {
    // Parse & lightly validate input
    const body = await req.json().catch(() => ({}));
    let { filename, userId } = body as { filename?: string; userId?: string };

    if (!filename || typeof filename !== "string") {
      return new Response(JSON.stringify({ error: "filename is required" }), {
        status: 400,
        headers,
      });
    }

    // Keep filename tidy (browsers can sometimes include paths)
    filename = filename.split("/").pop()!.split("\\").pop()!;

    // Create a Mux direct-upload with signed playback and a small passthrough blob
    const upload = await video.uploads.create({
      // Important: must match the site that will POST the file
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        // carry metadata to the webhook (<=255 chars total)
        passthrough: JSON.stringify({ filename, userId: userId ?? "anonymous" }),
        // Uncomment if you want downloadable MP4s generated:
        // mp4_support: "standard",
      },
    });

    // Seed a placeholder row; webhook will update when asset is ready
    await supabaseAdmin.from("videos").insert({
      owner_id: userId ?? "REPLACE_WITH_AUTH",
      status: "uploading",
      upload_id: upload.id,
      filename,
      // title can default to filename; webhook can refine later
      title: filename,
    });

    return Response.json(
      { uploadUrl: upload.url, uploadId: upload.id },
      { headers }
    );
  } catch (e: any) {
    console.error("create-upload error:", e?.message || e);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers,
    });
  }
}
