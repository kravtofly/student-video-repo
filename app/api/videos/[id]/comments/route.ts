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

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const videoId = params?.id;
  if (!videoId) return json({ error: "missing id" }, 400);

  const { data, error } = await supabaseAdmin
    .from("review_comments")
    .select("id, t_seconds, body, created_at")
    .eq("video_id", videoId)
    .order("t_seconds", { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json({ comments: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const videoId = params?.id;
  if (!videoId) return json({ error: "missing id" }, 400);
  const { t_seconds, body } = await req.json().catch(() => ({}));

  if (typeof t_seconds !== "number" || !isFinite(t_seconds))
    return json({ error: "invalid t_seconds" }, 400);
  if (!body || !String(body).trim())
    return json({ error: "empty body" }, 400);

  const { data, error } = await supabaseAdmin
    .from("review_comments")
    .insert({
      video_id: videoId,
      t_seconds,
      body: String(body).trim(),
    })
    .select("id, t_seconds, body, created_at")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ comment: data }, 201);
}
