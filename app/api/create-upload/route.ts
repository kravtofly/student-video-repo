// app/api/create-upload/route.ts
import { NextRequest } from "next/server";
import { video } from "@/lib/mux";           // your Mux SDK wrapper (uses MUX_TOKEN_ID/SECRET)
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

type Body = {
  filename?: string;
  // student identity (prefer UUID if you have it, else name/email)
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;

  // coach identity: either UUID (future) OR a text reference (today)
  coachId?: string | null;
  coachRef?: string | null;

  // optional context
  labId?: string | null;
  weekNumber?: number | null;
  level?: string | null;            // "Beginner" | "Intermediate" | "Advanced" | "Ninja"
  disciplines?: string[] | null;    // e.g. ["VFS","Belly"]
  kind?: string | null;             // "Tunnel" | "Sky"
  reviewOrderId?: string | null;    // UUID from the “review order” flow
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    const filename = body.filename ?? "upload";
    const ownerId = toUUID(body.ownerId ?? null);
    const coachId = toUUID(body.coachId ?? null);
    const coachRef = (body.coachRef ?? null) || null;

    const ownerName = body.ownerName ?? null;
    const ownerEmail = body.ownerEmail ?? null;

    const labId = body.labId ?? null;
    const weekNumber = body.weekNumber ?? null;
    const level = body.level ?? null;
    const kind = body.kind ?? null;

    const disciplines = Array.isArray(body.disciplines)
      ? body.disciplines.map(String)
      : null;

    // 1) Create a Mux direct upload. Include all context in passthrough.
    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: JSON.stringify({
          filename,
          ownerId, ownerName, ownerEmail,
          coachId, coachRef,
          labId, weekNumber, level, disciplines, kind,
          reviewOrderId: body.reviewOrderId ?? null,
        }),
      },
    });

    // 2) Upsert a “placeholder” row keyed by upload_id (status=uploading)
    const { error } = await supabaseAdmin.from("videos").upsert(
      {
        upload_id: upload.id,
        filename,
        title: filename,
        status: "uploading",

        // student (UUID only if valid)
        owner_id: ownerId,
        owner_name: ownerName,
        owner_email: ownerEmail,

        // coach (prefer UUID, else text ref)
        coach_id: coachId,
        coach_ref: coachRef,

        // context
        lab_id: labId,
        week_number: weekNumber,
        level,
        kind,
        disciplines,
        review_order_id: toUUID(body.reviewOrderId ?? null),
      },
      { onConflict: "upload_id" }
    );

    if (error) {
      console.error("create-upload upsert error:", error);
      return Response.json({ error: "database error" }, { status: 500 });
    }

    return Response.json({ uploadUrl: upload.url, uploadId: upload.id });
  } catch (err: any) {
    console.error("create-upload error:", err?.message || err);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
