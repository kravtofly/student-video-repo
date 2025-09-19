// app/api/admin/reconcile/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { video } from "@/lib/muxVideo";

const ADMIN_KEY = process.env.RECONCILE_SECRET!;

/**
 * Reconciles videos with (upload_id set && asset_id null):
 *  - fetch upload from Mux -> get asset_id
 *  - fetch asset -> ensure it has a signed playback_id (create one if missing)
 *  - update row with asset_id + playback_id
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-admin-key");
  if (!key || key !== ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find pending rows
  const { data: pending, error } = await supabaseAdmin
    .from("videos")
    .select("id, upload_id, asset_id, playback_id, created_at")
    .is("asset_id", null)
    .not("upload_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending?.length) {
    return NextResponse.json({ updated: 0, details: [] }, { status: 200 });
  }

  const details: Array<Record<string, any>> = [];
  let updated = 0;

  for (const row of pending) {
    const uploadId = row.upload_id as string;

    try {
      // 1) Look up the upload to discover asset_id (if upload has completed)
      const upload = await video.uploads.retrieve(uploadId);
      const assetId = (upload as any)?.asset_id ?? null;
      if (!assetId) {
        details.push({ id: row.id, uploadId, status: upload?.status ?? "unknown", note: "asset not created yet" });
        continue;
      }

      // 2) Fetch asset to see current playback IDs
      const asset = await video.assets.retrieve(assetId);
      let signedPlaybackId =
        (asset as any)?.playback_ids?.find((p: any) => p.policy === "signed")?.id ?? null;

      // 3) If no signed playback id exists, create one
      if (!signedPlaybackId) {
        const pb = await video.playbackIds.create(assetId, { policy: "signed" });
        signedPlaybackId = (pb as any).id;
      }

      // 4) Update the DB row
      const { error: upError } = await supabaseAdmin
        .from("videos")
        .update({ asset_id: assetId, playback_id: signedPlaybackId })
        .eq("id", row.id);

      if (upError) {
        details.push({ id: row.id, uploadId, assetId, error: upError.message });
        continue;
      }

      updated += 1;
      details.push({ id: row.id, uploadId, assetId, playback_id: signedPlaybackId, ok: true });
    } catch (e: any) {
      details.push({ id: row.id, uploadId, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({ updated, details }, { status: 200 });
}
