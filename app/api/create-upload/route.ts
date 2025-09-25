// app/api/create-upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { video } from "@/lib/mux";          // uses MUX_TOKEN_ID/SECRET
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allow your prod domains + localhost (Mux direct upload CORS)
const ALLOWED = new Set([
  "https://www.kravtofly.com",
  "https://kravtofly.com",
  "http://localhost:3000",
]);

const isUUID = (v?: string | null) =>
  !!(v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v));
const asEmail = (s?: string) => (s && /\S+@\S+\.\S+/.test(s) ? s : null);
const toLevel = (s?: string | null) =>
  s && ["Beginner", "Intermediate", "Advanced", "Ninja"].includes(s) ? (s as any) : null;
const toKind = (s?: string | null) =>
  s && ["Tunnel", "Sky"].includes(s) ? (s as any) : null;
const toDisciplines = (arr?: unknown): string[] =>
  Array.isArray(arr)
    ? arr
        .map(String)
        .filter((v) =>
          [
            "VFS","Tracking","Relative Work","Flocking","CRW","Camera Flying","BASE",
            "Angle Flying","Competition/Team Dynamics","Freestyle","Wingsuiting",
            "Canopy Piloting","Head Down","Head Up","Backflying","Freeflying",
            "Movement","Belly","Tunnel L1","Tunnel L2","Tunnel L3 Static","Tunnel L3 Dynamic",
            "Tunnel L4 Static","Tunnel L4 Dynamic","Tunnel Pro Flying",
          ].includes(v)
        )
    : [];

type Body = {
  filename?: string;
  userId?: string;              // keep if you’re passing it
  ownerEmail?: string;
  ownerName?: string;
  coachId?: string;
  labId?: string;
  weekNumber?: number;
  level?: "Beginner" | "Intermediate" | "Advanced" | "Ninja";
  kind?: "Tunnel" | "Sky";
  disciplines?: string[];       // from the approved list above
  reviewOrderId?: string;       // <-- NEW: link to review_orders.id (UUID)
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const {
      filename,
      userId,
      ownerEmail,
      ownerName,
      coachId,
      labId,
      weekNumber,
      level,
      kind,
      disciplines,
      reviewOrderId, // <- NEW
    } = body;

    // Choose a safe cors_origin for Mux direct upload
    const reqOrigin = req.headers.get("origin") || "";
    const corsOrigin =
      ALLOWED.has(reqOrigin) || reqOrigin.endsWith(".vercel.app")
        ? reqOrigin
        : "https://www.kravtofly.com";

    // 1) Create the Mux Direct Upload (asset has signed playback policy)
    const upload = await video.uploads.create({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough: JSON.stringify({
          filename,
          userId,
          ownerEmail,
          ownerName,
          coachId,
          labId,
          weekNumber,
          level: toLevel(level),
          kind: toKind(kind),
          disciplines: toDisciplines(disciplines),
          reviewOrderId: isUUID(reviewOrderId) ? reviewOrderId : null, // <- carry through
        }),
      },
    });

    // 2) Upsert the row immediately so the webhook can "update by upload_id"
    await supabaseAdmin.from("videos").upsert(
      {
        upload_id: (upload as any).id,
        filename: filename ?? null,
        title: filename ?? null,

        // owner/user metadata
        owner_id: userId ?? null, // leave as-is if you’re using elsewhere
        owner_email: asEmail(ownerEmail),
        owner_name: ownerName ?? null,

        // relationships
        coach_id: coachId ?? null,
        lab_id: labId ?? null,
        week_number: typeof weekNumber === "number" ? weekNumber : null,
        review_order_id: isUUID(reviewOrderId) ? reviewOrderId : null, // <- NEW

        // tags
        level: toLevel(level),
        kind: toKind(kind),
        disciplines: toDisciplines(disciplines),

        // status
        status: "uploading",
      },
      { onConflict: "upload_id" }
    );

    return NextResponse.json({
      uploadUrl: (upload as any).url,
      uploadId: (upload as any).id,
      corsOrigin,
    });
  } catch (err: any) {
    console.error("create-upload error", err?.message || err);
    return new NextResponse(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
