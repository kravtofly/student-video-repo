// app/api/mux-webhook/route.ts
import type { NextRequest } from "next/server";
import Mux from "@mux/mux-node";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

function ok(json: any) {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text(); // raw body required for signature verification
  const sig = req.headers.get("mux-signature") || "";
  const secret = process.env.MUX_WEBHOOK_SECRET!;

  try {
    // ✅ Correct for this SDK version
    Mux.Webhooks.verifySignature(raw, sig, secret);

    const evt = JSON.parse(raw) as { type: string; data: any };
    const { type, data } = evt;

    if (type === "video.asset.created") {
      let meta: any = {};
      try { meta = data.passthrough ? JSON.parse(data.passthrough) : {}; } catch {}

      await supabaseAdmin.from("videos").upsert(
        {
          asset_id: data.id,
          upload_id: data.upload_id ?? null,
          filename: meta.filename ?? null,
          title: meta.filename ?? null,
          owner_id: asUUID(meta.userId),
          status: "processing",
        },
        { onConflict: "asset_id" }
      );

      return ok({ ok: true, handled: "asset.created" });
    }

    if (type === "video.asset.ready") {
      const playbackId: string | undefined = data?.playback_ids?.[0]?.id;

      await supabaseAdmin
        .from("videos")
        .update({ status: "ready", playback_id: playbackId ?? null })
        .eq("asset_id", data.id);

      return ok({ ok: true, handled: "asset.ready" });
    }

    return ok({ ok: true, handled: "ignored", type });
  } catch (err: any) {
    console.error("mux-webhook error:", err?.message || err);
    return new Response(JSON.stringify({ error: "invalid webhook" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}
