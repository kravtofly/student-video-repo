// app/api/create-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { video } from "../../../lib/mux";         // keep your existing helper
import { supabaseAdmin } from "../../../lib/supabase"; // keep your existing helper

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid caching in Edge

// allow your prod domain, bare prod, and local dev;
// for Vercel previews we’ll accept the exact origin sent by the browser
const ALLOWED = new Set([
  "https://www.kravtofly.com",
  "https://kravtofly.com",
  "http://localhost:3000",
]);

const toUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

export async function POST(req: NextRequest) {
  try {
    const { filename, userId } = await req.json().catch(() => ({} as { filename?: string; userId?: string }));

    // Choose a tight CORS origin for the Mux direct upload:
    // - if request comes from an allowed origin, echo it
    // - if it’s a Vercel preview (ends with .vercel.app), allow it
    // - otherwise default to your production site
    const reqOrigin = req.headers.get("origin") || "";
    const corsOrigin =
      ALLOWED.has(reqOrigin) || reqOrigin.endsWith(".vercel.app")
        ? reqOrigin
        : "https://www.kravtofly.com";

    // Create a direct upload that will produce an asset with a **signed** playback ID
    const upload = await video.uploads.create({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policy: ["signed"], // <-- important: asset will have a signed playback_id
        passthrough: JSON.stringify({ filename, userId }),
      },
    });

    // Upsert so accidental replays don’t 409; only persist owner_id if it's a valid UUID
    await supabaseAdmin.from("videos").upsert(
      {
        upload_id: (upload as any).id,
        filename: filename ?? null,
        owner_id: toUUID(userId),
        status: "uploading",
        title: filename ?? null,
      },
      { onConflict: "upload_id" }
    );

    return NextResponse.json({
      uploadUrl: (upload as any).url,
      uploadId: (upload as any).id,
      corsOrigin,
    });
  } catch (err: any) {
    console.error("create-upload error:", err?.message || err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
