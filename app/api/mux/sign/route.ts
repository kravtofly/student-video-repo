import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { playbackId } = await req.json().catch(() => ({}));
    if (!playbackId) return json({ error: "missing playbackId" }, 400);

    const keyId = process.env.MUX_SIGNING_KEY_ID;
    let key = process.env.MUX_SIGNING_KEY_SECRET; // <-- your existing env var
    if (!keyId || !key) return json({ error: "signing not configured" }, 500);

    // If the private key was pasted with "\n", normalize to real newlines.
    if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");

    // Create a signed playback token:
    // - RS256 with your private key
    // - "kid" in the JWT header (keyid option)
    // - audience "v" for video playback
    const token = jwt.sign(
      { aud: "v" },
      key,
      { algorithm: "RS256", expiresIn: "12h", keyid: keyId }
    );

    // HLS stream (use ".m3u8"); for MP4 previews you could sign different endpoints as needed
    const url = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    return json({ url });
  } catch (e: any) {
    console.error("mux/sign error:", e?.message || e);
    return json({ error: "server error" }, 500);
  }
}
