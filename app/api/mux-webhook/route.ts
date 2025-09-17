import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import Mux, { Webhooks } from "@mux/mux-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

// CORS (Mux calls your webhook server-to-server)
function corsHeaders(_: NextRequest) {
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
    // 1) Read raw body + signature header
    const raw = await req.text();
    const sig = req.headers.get("mux-signature") ?? "";

    // 2) Verify using the named export
    Webhooks.verifySignature(raw, sig, process.env.MUX_WEBHOOK_SECRET!);

    // 3) Parse the event
    const evt = JSON.parse(raw);

    // Helper to safely parse passthrough JSON
    const safeParse = (v: any) => {
      try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; }
    };

    // 4) Upsert rows for the interesting events
    if (evt?.type === "video.asset.created") {
      const a = evt.data;
      const pt = safeParse(a.passthrough);
      await supabaseAdmin.from("videos").upsert({
        upload_id: a.upload_id || null,
        mux_asset_id: a.id,
        filename: pt?.filename || null,
        owner_id: pt?.userId || null,
        title: pt?.title || pt?.filename || null,
        status: "processing",
      }, { onConflict: "mux_asset_id" });
    }

    if (evt?.type === "video.asset.ready") {
      const a = evt.data;
      const pt = safeParse(a.passthrough);
      const signedPlayback = (a.playback_ids || []).find((p: any) => p.policy === "signed");
      await supabaseAdmin.from("videos").upsert({
        upload_id: a.upload_id || null,
        mux_asset_id: a.id,
        filename: pt?.filename || null,
        owner_id: pt?.userId || null,
        title: pt?.title || pt?.filename || null,
        duration: a.duration ?? null,
        playback_id: signedPlayback?.id || null,
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
