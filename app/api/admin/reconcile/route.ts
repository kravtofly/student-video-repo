// app/api/admin/reconcile/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { video } from "@/lib/muxVideo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_KEY = process.env.RECONCILE_SECRET!;

// Map Mux asset.status => our videos.status
function mapMuxStatus(s?: string): "ready" | "processing" | "errored" {
  if (s === "ready") return "ready";
  if (s === "errored") return "errored";
  return "processing"; // preparing/whatever else => processing
}

export async function POST(req: Request) {
  const key = req.headers.get("x-admin-key");
  if (!key || key !== ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const details: Array<Record<string, any>> = [];
  let updated = 0;

  // -------------------------------
  // Pass 1: rows with upload_id but no asset_id (discover from upload)
  // -------------------------------
  {
    const { data: pending, error } = await supabaseAdmin
      .from("videos")
      .select("id, upload_id, asset_id, playback_id, status, created_at")
      .is("asset_id", null)
      .not("upload_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of pending ?? []) {
      const uploadId = row.upload_id as string;

      try {
        // 1) Look up the upload to discover asset_id (once complete)
        const upload = await video.uploads.retrieve(uploadId);
        const assetId = (upload as any)?.asset_id ?? null;
        if (!assetId) {
          details.push({
            id: row.id,
            uploadId,
            mux_upload_status: (upload as any)?.status ?? "unknown",
            note: "asset not created yet",
          });
          continue;
        }

        // 2) Fetch the asset; determine status & ensure signed playback ID
        const asset = await video.assets.retrieve(assetId);
        const newStatus = mapMuxStatus((asset as any)?.status);
        let signedPlaybackId =
          (asset as any)?.playback_ids?.find((p: any) => p.policy === "signed")?.id ?? null;

        if (!signedPlaybackId) {
          const pb = await video.assets.createPlaybackId(assetId, { policy: "signed" });
          signedPlaybackId = (pb as any)?.id ?? null;
        }

        // 3) Update the DB row
        const { error: upError } = await supabaseAdmin
          .from("videos")
          .update({
            asset_id: assetId,
            playback_id: signedPlaybackId,
            status: newStatus,
          })
          .eq("id", row.id);

        if (upError) {
          details.push({ id: row.id, uploadId, assetId, error: upError.message });
          continue;
        }

        updated += 1;
        details.push({
          id: row.id,
          uploadId,
          assetId,
          playback_id: signedPlaybackId,
          status: newStatus,
          ok: true,
        });
      } catch (e: any) {
        details.push({ id: row.id, uploadId, error: e?.message || String(e) });
      }
    }
  }

  // -------------------------------
  // Pass 2: rows that HAVE asset_id but are not fully ready yet
  // (playback_id is null OR status != 'ready')
  // -------------------------------
  {
    const { data: needsSweep, error } = await supabaseAdmin
      .from("videos")
      .select("id, asset_id, playback_id, status, created_at")
      .not("asset_id", "is", null)
      .or("playback_id.is.null,status.neq.ready") // PostgREST .or() syntax
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of needsSweep ?? []) {
      const assetId = row.asset_id as string;

      try {
        const asset = await video.assets.retrieve(assetId);
        const newStatus = mapMuxStatus((asset as any)?.status);
        let signedPlaybackId =
          (asset as any)?.playback_ids?.find((p: any) => p.policy === "signed")?.id ?? null;

        if (!signedPlaybackId) {
          const pb = await video.assets.createPlaybackId(assetId, { policy: "signed" });
          signedPlaybackId = (pb as any)?.id ?? null;
        }

        const { error: upError } = await supabaseAdmin
          .from("videos")
          .update({
            playback_id: signedPlaybackId,
            status: newStatus,
          })
          .eq("id", row.id);

        if (upError) {
          details.push({ id: row.id, assetId, error: upError.message });
          continue;
        }

        updated += 1;
        details.push({
          id: row.id,
          assetId,
          playback_id: signedPlaybackId,
          status: newStatus,
          ok: true,
        });
      } catch (e: any) {
        details.push({ id: row.id, assetId, error: e?.message || String(e) });
      }
    }
  }

  return NextResponse.json({ updated, details }, { status: 200 });
}
