// app/api/create-upload/route.ts
import { NextRequest } from "next/server";
import { video } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- CORS ---
const ALLOWED = new Set([
  "https://www.kravtofly.com",
  "https://kravtofly.com",
]);
function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const h = new Headers();
  h.set(
    "Access-Control-Allow-Origin",
    ALLOWED.has(origin) || process.env.NODE_ENV === "development" ? (origin || "*") : "https://www.kravtofly.com"
  );
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

// --- POST /api/create-upload ---
export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  try {
    const body = await req.json().catch(() => ({}));
    let { filename, userId } = body as { filename?: string; userId?: string };

    if (!filename || typeof filename !== "string") {
      return Response.json({ error: "filename is required" }, { status: 400, headers });
    }
    // sanitize browser-provided filename
    filename = filename.split("/").pop()!.split("\\").pop()!;

    // Create direct-upload with signed playback + passthrough
    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: JSON.stringify({ filename, userId: userId ?? "anonymous" }),
        // mp4_support: "standard", // <— uncomment if you want downloadable MP4s
      },
    });

    // Seed DB row; webhook will fill in asset_id/playback_id/duration/status
    const { error: sbError } = await supabaseAdmin.from("videos").insert({
      owner_id: userId ?? "REPLACE_WITH_AUTH",
      status: "uploading",
      upload_id: upload.id,
      filename,
      title: filename,
    });
    if (sbError) {
      console.error("Supabase insert failed:", sbError);
      return Response.json({ error: "db insert failed" }, { status: 500, headers });
    }

    return Response.json({ uploadUrl: upload.url, uploadId: upload.id }, { headers });
  } catch (e: any) {
    console.error("create-upload error:", e?.message || e);
    return Response.json({ error: "server error" }, { status: 500, headers });
  }
}
