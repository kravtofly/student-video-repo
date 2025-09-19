// app/api/mux-webhook/route.ts
import type { NextRequest } from "next/server";
import Mux from "@mux/mux-node";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

// Handle the Mux SDK differences across versions (verifySignature vs verifyHeader vs verify)
function verifyMuxWebhook(raw: string, signature: string, secret: string) {
  try {
    // Cast to any to avoid TypeScript issues with dynamic property access
    const webhooks = (Mux as any).Webhooks;
    
    if (!webhooks) {
      throw new Error("Mux.Webhooks not found in SDK");
    }
    
    // Try different method names that exist across versions
    const methods = ['verifySignature', 'verifyHeader', 'verify'];
    
    for (const method of methods) {
      if (typeof webhooks[method] === "function") {
        console.log(`Using Mux webhook verification method: ${method}`);
        return webhooks[method](raw, signature, secret);
      }
    }
    
    throw new Error("No compatible webhook verification method found in Mux SDK");
  } catch (error) {
    console.error("Webhook verification failed:", error);
    throw error;
  }
}

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
  try {
    const raw = await req.text(); // raw body required for Mux verification
    const sig = req.headers.get("mux-signature") || "";
    const secret = process.env.MUX_WEBHOOK_SECRET;
    
    if (!secret) {
      console.error("MUX_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "webhook secret not configured" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    // Verify the webhook signature
    verifyMuxWebhook(raw, sig, secret);

    const evt = JSON.parse(raw) as { type: string; data: any };
    const { type, data } = evt;

    if (type === "video.asset.created") {
      let meta: any = {};
      try {
        meta = data?.passthrough ? JSON.parse(data.passthrough) : {};
      } catch (parseError) {
        console.warn("Failed to parse passthrough data:", parseError);
      }

      const result = await supabaseAdmin.from("videos").upsert(
        {
          asset_id: data.id,
          upload_id: data.upload_id ?? null,
          filename: meta.filename ?? null,
          title: meta.filename ?? null,
          owner_id: asUUID(meta.userId), // null if not a UUID
          status: "processing",
        },
        { onConflict: "asset_id" }
      );
      
      if (result.error) {
        console.error("Supabase upsert error (asset.created):", result.error);
        return new Response(JSON.stringify({ error: "database error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      return ok({ ok: true, handled: "asset.created" });
    }

    if (type === "video.asset.ready") {
      const playbackId: string | undefined = data?.playback_ids?.[0]?.id;

      const result = await supabaseAdmin
        .from("videos")
        .update({ status: "ready", playback_id: playbackId ?? null })
        .eq("asset_id", data.id);
        
      if (result.error) {
        console.error("Supabase update error (asset.ready):", result.error);
        return new Response(JSON.stringify({ error: "database error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      return ok({ ok: true, handled: "asset.ready" });
    }

    // ignore other events
    return ok({ ok: true, handled: "ignored", type });
  } catch (err: any) {
    console.error("mux-webhook error:", err?.message || err);
    return new Response(JSON.stringify({ error: "invalid webhook" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}
