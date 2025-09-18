// app/api/create-upload/route.ts
const toUUID = (v?: string | null) =>
  v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)
    ? v
    : null;

export async function POST(req: NextRequest) {
  const { filename, userId } = await req.json();

  const upload = await video.uploads.create({
    cors_origin: "https://www.kravtofly.com",
    new_asset_settings: {
      playback_policy: ["signed"],
      passthrough: JSON.stringify({ filename, userId }),
    },
  });

  // use upsert so duplicates don’t cause 409, and only save a real UUID
  await supabaseAdmin.from("videos").upsert(
    {
      upload_id: upload.id,
      filename: filename ?? null,
      owner_id: toUUID(userId),
      status: "uploading",
      title: filename ?? null,
    },
    { onConflict: "upload_id" }
  );

  return Response.json({ uploadUrl: upload.url, uploadId: upload.id });
}
