// app/api/videos/[id]/mark-uploaded/route.ts
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params?.id;
  if (!id) return json({ error: "missing id" }, 400);

  const { error } = await supabaseAdmin
    .from("videos")
    .update({ status: "uploaded" })
    .eq("id", id);

  if (error) return json({ error: "db error" }, 500);
  return json({ ok: true });
}
