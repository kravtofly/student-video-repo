// app/api/create-upload/route.ts
import type { NextRequest } from "next/server";
import { video } from "@/lib/mux";               // your Mux client
import { supabaseAdmin } from "@/lib/supabase";  // your Supabase admin client

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  filename?: string;
  reviewOrderId?: string;       // UUID
  uploadToken?: string;         // string
  ownerName?: string;
  ownerEmail?: string;
  coachRef?: string;            // display-only, not trusted
  kind?: "review" | "lab" | string;

  // NEW first-class questionnaire fields
  description?: string;
  discipline?: string;
  workingWell?: string;
  struggling?: string;
  otherInfo?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const {
      filename,
      reviewOrderId,
      uploadToken,
      ownerName,
      ownerEmail,
      coachRef,
      kind = "review",
      description,
      discipline,
      workingWell,
      struggling,
      otherInfo,
    } = (await req.json()) as Body;

    if (!reviewOrderId || !uploadToken) {
      return json({ error: "missing reviewOrderId or uploadToken" }, 400);
    }

    // Validate order + token (and expiry if present)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("review_orders")
      .select("id, upload_token, token_expires_at, status, student_email, student_name, coach_id")
      .eq("id", reviewOrderId)
      .single();

    if (orderErr || !order) return json({ error: "order not found" }, 404);
    if (order.upload_token !== uploadToken) return json({ error: "invalid token" }, 403);
    if (order.token_expires_at && new Date(order.token_expires_at) < new Date()) {
      return json({ error: "token expired" }, 403);
    }
    if (!["paid", "scheduled"].includes(order.status)) {
      return json({ error: "order not eligible for upload" }, 400);
    }

    // Choose a CORS origin for Mux Direct Upload (allowlist)
    const origin = req.headers.get("origin") || "";
    const allowed = [
      "https://www.kravtofly.com",
      "https://student-video-repo.vercel.app",
      "http://localhost:3000",
    ];
    const corsOrigin = allowed.includes(origin) ? origin : "https://www.kravtofly.com";

    // Create Mux Direct Upload (keep passthrough tiny)
    const upload = await video.uploads.create({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policy: ["signed"], // matches your existing signed flow
        passthrough: JSON.stringify({ r: reviewOrderId, v: 1 }),
      },
      timeout: 3600,
    });

    // Insert (or upsert) the videos row with first-class fields
    const insert = {
      upload_id: upload.id,
      status: "uploading" as const,
      filename: filename ?? null,
      title: filename ?? null,
      kind,
      review_order_id: reviewOrderId,
      owner_name: ownerName ?? order.student_name ?? null,
      owner_email: ownerEmail ?? order.student_email ?? null,
      coach_ref: coachRef ?? null, // display-only; real coach_id comes from order if you store it
      // NEW questionnaire columns
      description: description ?? null,
      discipline: discipline ?? null,
      working_well: workingWell ?? null,
      struggling: struggling ?? null,
      other_info: otherInfo ?? null,
    };

    // Ensure you have a UNIQUE index on videos.upload_id for this to be safe
    const { data: row, error: upErr } = await supabaseAdmin
      .from("videos")
      .upsert(insert, { onConflict: "upload_id" })
      .select("id")
      .single();

    if (upErr) {
      console.error("supabase upsert error:", upErr);
      return json({ error: "database error" }, 500);
    }

    return json({ uploadUrl: upload.url, uploadId: upload.id, videoId: row?.id });
  } catch (err: any) {
    console.error("create-upload error:", err?.message || err);
    return json({ error: "server error" }, 500);
  }
}
