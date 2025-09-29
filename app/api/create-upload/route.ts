// app/api/create-upload/route.ts
import { NextRequest } from "next/server";
import { video } from "@/lib/mux";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isUUID = (v?: string | null) =>
  !!(v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v));

type ReviewOrder = {
  id: string;
  upload_token: string | null;
  upload_expires_at: string | null;
  student_name: string | null;
  student_email: string | null;
  student_user_id?: string | null;
  coach_user_id?: string | null;
  lab_id?: string | null;
  offer_type?: string | null;
};

function bad(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const filename: string | null = body?.filename ?? null;
    const reviewOrderId: string | null = body?.reviewOrderId ?? null;
    const token: string | null = body?.token ?? null;

    if (!reviewOrderId || !token) {
      return bad(400, "Missing reviewOrderId or token");
    }

    // Load & validate review order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("review_orders")
      .select(
        "id, upload_token, upload_expires_at, student_name, student_email, student_user_id, coach_user_id, lab_id, offer_type"
      )
      .eq("id", reviewOrderId)
      .single<ReviewOrder>();

    if (orderErr || !order) return bad(404, "Review order not found");
    if (!order.upload_token || order.upload_token !== token) return bad(403, "Invalid upload token");
    if (order.upload_expires_at && Date.now() > new Date(order.upload_expires_at).getTime()) {
      return bad(403, "Upload link expired");
    }

    // Mux direct upload with passthrough
    const passthrough = JSON.stringify({
      filename: filename || undefined,
      reviewOrderId: order.id,
    });

    const upload = await video.uploads.create({
      cors_origin: "https://www.kravtofly.com",
      new_asset_settings: {
        playback_policy: ["signed"],
        passthrough,
      },
    });

    // Upsert a safe placeholder row
    const row: Record<string, any> = {
      upload_id: upload.id,
      filename: filename ?? null,
      title: filename ?? null,
      status: "uploading",          // <-- stays within your constraint
      review_order_id: order.id,
      owner_name: order.student_name ?? null,
      owner_email: order.student_email ?? null,
    };

    if (isUUID(order.student_user_id)) row.owner_id = order.student_user_id;
    if (isUUID(order.coach_user_id)) row.coach_id = order.coach_user_id;
    if (order.lab_id) row.lab_id = order.lab_id;           // TEXT column
    if (order.offer_type) row.kind = order.offer_type;     // TEXT column

    const { error: upErr } = await supabaseAdmin.from("videos").upsert(row, { onConflict: "upload_id" });
    if (upErr) {
      console.error("videos upsert (create-upload) error:", upErr);
      return bad(500, "Database error");
    }

    return Response.json({ uploadUrl: upload.url, uploadId: upload.id });
  } catch (err: any) {
    console.error("create-upload error", err?.message || err);
    return bad(500, "Server error");
  }
}
