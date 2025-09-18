// in video.asset.created
await supabaseAdmin.from("videos").upsert({
  asset_id: data.id,
  upload_id: data.upload_id ?? null,
  filename: meta.filename ?? null,
  title: meta.filename ?? null,
  owner_id: asUUID(meta.userId), // or omit
  status: "processing"
}, { onConflict: "asset_id" });

// in video.asset.ready
await supabaseAdmin.from("videos").update({
  status: "ready",
  playback_id: playbackId
}).eq("asset_id", data.id);
