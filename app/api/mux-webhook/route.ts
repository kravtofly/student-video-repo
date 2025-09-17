import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Mux from "@mux/mux-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

// Simple CORS for Mux webhook POSTs
function corsHeaders(req: NextRequest) {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", "*");
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

  try {
    // Read raw body for signature verification
    const raw = await req.text();
    const sig = req.headers.get("mux-signature") || "";

    // Verify webhook (required)
    Mux.Webhooks.verifySignature(
      raw,
      sig,
      process.env.MUX_WEBHOOK_SECRET!
    );

    const evt = JSON.parse(raw);

    // We’ll upsert rows at key lifecycle events
    if (evt?.type === "video.asset.created") {
      const a = evt.data;
      const passthrough = safeParse(a.passthrough);
      await supabaseAdmin.from("videos").upsert({
        upload_id: a.upload_id || null,
        mux_asset_id: a.id,
        filename: passthrough?.filename || null,
        owner_id: passthrough?.userId || null,
        title: passthrough?.title || passthrough?.filename || null,
        status: "processing",
      }, { onConflict: "mux_asset_id" });
    }

    if (evt?.type === "video.asset.ready") {
      const a = evt.data;
      const passthrough = safeParse(a.passthrough);

      // pick the signed playback id (that’s all we create)
      const signedPlayback = (a.playback_ids || []).find((p: any) => p.policy === "signed");
      const playbackId = signedPlayback?.id || null;

      await supabaseAdmin.from("videos").upsert({
        upload_id: a.upload_id || null,
        mux_asset_id: a.id,
        filename: passthrough?.filename || null,
        owner_id: passthrough?.userId || null,
        title: passthrough?.title || passthrough?.filename || null,
        duration: a.duration ?? null,
        playback_id: playbackId,
        status: "ready",
      }, { onConflict: "mux_asset_id" });
    }

    if (evt?.type === "video.asset.errored") {
      const a = evt.data;
      await supabaseAdmin.from("videos").upsert({
        mux_asset_id: a.id,
        status: "error",
      }, { onConflict: "mux_asset_id" });
    }

    return Response.json({ ok: true }, { headers });
  } catch (err: any) {
    console.error("mux-webhook error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
  }
}

function safeParse(s: any) {
  try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; }
}
