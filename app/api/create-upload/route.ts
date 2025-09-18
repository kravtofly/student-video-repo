// helper to validate UUIDs
const toUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

// inside POST handler:
const { filename, userId } = await req.json();
const upload = await video.uploads.create({
  cors_origin: "https://www.kravtofly.com",
  new_asset_settings: {
    playback_policy: ["signed"],
    passthrough: JSON.stringify({ filename, userId }),
  },
});

await supabaseAdmin.from("videos").upsert(
  {
    upload_id: upload.id,
    filename: filename ?? null,
    owner_id: toUUID(userId),   // only write if it's a real UUID
    status: "uploading",
  },
  { onConflict: "upload_id" },
);
