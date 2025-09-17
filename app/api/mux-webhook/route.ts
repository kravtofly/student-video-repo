// app/api/mux-webhook/route.ts
import { NextRequest } from "next/server";
import { video, Webhooks } from "../../../lib/mux";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    // IMPORTANT: we need the raw body to verify Mux’s signature
    const raw = await req.text();
    const sig = req.headers.get("mux-signature") || "";

    Webhooks.verify(raw, sig, process.env.MUX_WEBHOOK_SECRET!); // throws if invalid
    const evt = JSON.parse(raw);

    switch (evt.type) {
      // When a direct upload record is created, stash it
      case "video.upload.created": {
        const uploadId: string = evt.data?.id;
        await supabaseAdmin.from("videos").upsert(
          { upload_id: uploadId, status: "uploading" },
          { onConflict: "upload_id" }
        );
        break;
      }

      // Asset exists (may not be ready yet) – ensure we have a row keyed by asset_id
      case "video.asset.created": {
        const assetId: string = evt.data?.id;
        const asset = await video.assets.retrieve(assetId);

        // try to read passthrough metadata
        let filename: string | null = null;
        let owner_id: string | null = null;
        try {
          if (asset.passthrough) {
            const p = JSON.parse(asset.passthrough);
            filename = p?.filename ?? null;
            owner_id = p?.userId ?? null;
          }
        } catch {}

        await supabaseAdmin.from("videos").upsert(
          {
            asset_id: asset.id,
            upload_id: asset.upload_id ?? null,
            playback_id:
              asset.playback_ids?.find((p) => p.policy === "signed" || p.policy === "public")?.id ?? null,
            filename,
            owner_id,
            status: "preparing"
          },
          { onConflict: "asset_id" }
        );
        break;
      }

      // Final state – write playback_id + mark ready
      case "video.asset.ready": {
        const assetId: string = evt.data?.id;
        const asset = await video.assets.retrieve(assetId);

        const playbackId =
          asset.playback_ids?.find((p) => p.policy === "signed" || p.policy === "public")?.id ?? null;

        let filename: string | null = null;
        let owner_id: string | null = null;
        try {
          if (asset.passthrough) {
            const p = JSON.parse(asset.passthrough);
            filename = p?.filename ?? null;
            owner_id = p?.userId ?? null;
          }
        } catch {}

        await supabaseAdmin.from("videos").upsert(
          {
            asset_id: asset.id,
            upload_id: asset.upload_id ?? null,
            playback_id: playbackId,
            filename,
            owner_id,
            status: "ready"
          },
          { onConflict: "asset_id" }
        );
        break;
      }

      default:
        // ignore other events for now
        break;
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err: any) {
    console.error("mux-webhook error", err?.message || err);
    return new Response(JSON.stringify({ error: "invalid" }), { status: 400, headers });
  }
}
