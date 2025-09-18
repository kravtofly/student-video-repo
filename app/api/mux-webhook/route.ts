// inside video.asset.created
await supabaseAdmin.from("videos").upsert(
  {
    asset_id: data.id,
    upload_id: data.upload_id ?? null,
    filename: meta.filename ?? null,
    owner_id: asUUID(meta.userId), // or null
    status: "processing",
    title: meta.filename ?? null,
  },
  { onConflict: "asset_id" }
);
// inside video.asset.ready
await supabaseAdmin
  .from("videos")
  .update({
    status: "ready",
    playback_id: playbackId,
  })
  .eq("asset_id", data.id);
