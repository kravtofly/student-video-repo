// app/api/create-upload/route.ts
import type { NextRequest } from "next/server";
import { video } from "@/lib/mux";          // your existing Mux client (uses MUX_TOKEN_ID/SECRET)
import { supabaseAdmin } from "@/lib/supabase"; // your existing Supabase admin client

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid any static rendering

type Body = {
  filename?: string;
  reviewOrderId?: string; // UUID
  uploadToken?: string;   // random string
  ownerName?: string;
  ownerEmail?: string;
  coachRef?: string;      // TEXT (slug or CMS id) — NOT a UUID
  kind?: "review" | "lab" | string;
};

function ok(json: any, status = 200) {
  return new Response(JSON.stringify(json), {
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
    } = (await req.json()) as Body;

    if (!reviewOrderId || !uploadToken) {
      return ok({ error: "missing reviewOrderId or uploadToken" }, 400);
    }

    // (Optional but recommended) Verify the secure link against your review_orders table
    // If your table/columns are named differently, adjust this query.
    const { data: ro, error: roErr } = await supabaseAdmin
      .from("review_orders")
      .select("id, upload_token")
      .eq("id", reviewOrderId)
      .single();

    if (roErr || !ro || ro.upload_token !== uploadToken) {
      return ok({ error: "invalid or expired upload link" }, 403);
    }

    // Create a Mux Direct Upload with a **tiny** passthrough payload (Mux max 255 bytes)
    // Use short keys: r = reviewOrderId, t = uploadToken, v = version
    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: JSON.stringify({ r: reviewOrderId, t: uploadToken, v: 1 }),
      },
    });

    // Record (or upsert) the row immediately so the webhook can join by upload_id.
    // NOTE: We write coach_ref (TEXT), not coach_id (UUID).
    const { error: upErr } = await supabaseAdmin
      .from("videos")
      .upsert(
        {
          upload_id: upload.id,
          status: "uploading",
          filename: filename ?? null,
          title: filename ?? null,

          // "Middle path" fields:
          kind,
          review_order_id: reviewOrderId,
          owner_name: ownerName ?? null,
          owner_email: ownerEmail ?? null,
          coach_ref: coachRef ?? null, // <-- text, safe for “Chris Fikes”, “coach_kate”, CMS ref, etc.
        },
        { onConflict: "upload_id" }
      );

    if (upErr) {
      console.error("supabase upsert error:", upErr);
      return ok({ error: "database error" }, 500);
    }

    return ok({ uploadUrl: upload.url, uploadId: upload.id });
  } catch (err: any) {
    // Surface Mux validation errors during testing
    const msg =
      err?.message ||
      (typeof err === "object" ? JSON.stringify(err) : String(err));
    console.error("create-upload error:", msg);
    return ok({ error: "server error" }, 500);
  }
}
