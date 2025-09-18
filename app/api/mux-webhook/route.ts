import { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

// simple UUID check
const asUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v) ? v : null;

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin");
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin === "https://www.kravtofly.com" || process.env.NODE_ENV === "development" ? (origin || "*") : "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "*");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  const raw = await req.text();
  let evt: any;
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers });
  }
  const t = evt?.type;
  const objType = evt?.object?.type;
  const data = evt?.data ?? {};

  // We only handle asset events (where passthrough is available)
  if (objType !== "asset") {
    return new Response(JSON.stringify({ ok: true, ignored: objType ?? "unknown" }), { status: 200, headers });
  }

  let meta: { filename?: string; userId?: string } = {};
  try {
    if (typeof data.passthrough === "string") {
      meta = JSON.parse(data.passthrough);
    }
  } catch { /* ignore */ }

  const uploadId = data.upload_id as string | undefined;
  const assetId = data.id as string | undefined;
  const playbackId =
    (Array.isArray(data.playback_ids)
      ? data.playback_ids.find((p: any) => p.policy === "signed")?.id
      : undefined) || null;
  const ownerId = asUUID(meta.userId); // only accept real UUIDs

  try {
    if (t === "video.asset.created") {
      // upsert on asset creation
      await supabaseAdmin.from("videos").upsert(
        {
          asset_id: assetId,
          upload_id: uploadId ?? null,
          filename: meta.filename ?? null,
          title: meta.filename ?? null,
          owner_id: ownerId,
          status: "processing"
        },
        { onConflict: "asset_id" }
      );
    } else if (t === "video.asset.ready") {
      // mark ready and set playback ID
      await supabaseAdmin
        .from("videos")
        .update({ playback_id: playbackId, status: "ready" })
        .eq("asset_id", assetId!);
    } else {
      const status = t?.endsWith(".errored") ? "errored" : t?.includes("non_standard") ? "processing" : undefined;
      if (status) {
        await supabaseAdmin.from("videos").update({ status }).eq("asset_id", assetId!);
      }
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e: any) {
    console.error("mux-webhook error", e?.message || e);
    return new Response(JSON.stringify({ error: "db error" }), { status: 500, headers });
  }
}
