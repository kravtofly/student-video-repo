// app/api/create-upload/route.ts
import type { NextRequest } from "next/server";
import { video } from "@/lib/mux";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  filename?: string;
  reviewOrderId?: string;
  uploadToken?: string;
  ownerName?: string;
  ownerEmail?: string;
  coachRef?: string;
  kind?: "review" | "lab" | string;

  // NEW questionnaire fields
  description?: string;   // NEW
  discipline?: string;    // NEW
  workingWell?: string;   // NEW
  struggling?: string;    // NEW
  otherInfo?: string;     // NEW
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

      // NEW
      description,
      discipline,
      workingWell,
      struggling,
      otherInfo,
    } = (await req.json()) as Body;

    if (!reviewOrderId || !uploadToken) {
      return ok({ error: "missing reviewOrderId or uploadToken" }, 400);
    }

    const { data: ro, error: roErr } = await supabaseAdmin
      .from("review_orders")
      .select("id, upload_token")
      .eq("id", reviewOrderId)
      .single();

    if (roErr || !ro || ro.upload_token !== uploadToken) {
      return ok({ error: "invalid or expired upload link" }, 403);
    }

    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: JSON.stringify({ r: reviewOrderId, t: uploadToken, v: 1 }),
      },
    });

    // ⬇️ include the new columns + RETURN the row id
    const { data: row, error: upErr } = await supabaseAdmin
      .from("videos")
      .upsert(
        {
          upload_id: upload.id,
          status: "uploading",
          filename: filename ?? null,
          title: filename ?? null,
          kind,
          review_order_id: reviewOrderId,
          owner_name: ownerName ?? null,
          owner_email: ownerEmail ?? null,
          coach_ref: coachRef ?? null,

          // NEW first-class columns
          description: description ?? null,
          discipline: discipline ?? null,
          working_well: workingWell ?? null,
          struggling: struggling ?? null,
          other_info: otherInfo ?? null,
        },
        { onConflict: "upload_id" }
      )
      .select("id")          // NEW
      .single();             // NEW

    if (upErr) {
      console.error("supabase upsert error:", upErr);
      return ok({ error: "database error" }, 500);
    }

    return ok({ uploadUrl: upload.url, uploadId: upload.id, videoId: row?.id }); // NEW
  } catch (err: any) {
    const msg = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
    console.error("create-upload error:", msg);
    return ok({ error: "server error" }, 500);
  }
}
