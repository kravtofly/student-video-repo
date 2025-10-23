import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const order = searchParams.get("order");
    const token = searchParams.get("token");
    if (!order || !token) {
      return Response.json({ error: "missing params" }, { status: 400 });
    }

    const { data: ro, error } = await supabaseAdmin
      .from("review_orders")
      .select("id, upload_token, student_email, student_name, coach_name, coach_ref")
      .eq("id", order)
      .single();

    if (error || !ro) return Response.json({ error: "not found" }, { status: 404 });
    if (ro.upload_token !== token) return Response.json({ error: "forbidden" }, { status: 403 });

    return Response.json({
      student_email: ro.student_email ?? null,
      student_name:  ro.student_name  ?? null,
      coach_name:    ro.coach_name    ?? null,
      coach_ref:     ro.coach_ref     ?? null,
    });
  } catch (e) {
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
