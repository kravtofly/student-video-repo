import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { playbackId } = await req.json().catch(() => ({}));
    if (!playbackId) return j({ error: "MISSING_PLAYBACK_ID" }, 400);

    const keyId = process.env.MUX_SIGNING_KEY_ID;
    let key = process.env.MUX_SIGNING_KEY_SECRET;
    if (!keyId || !key) return j({ error: "NO_ENV" }, 500);

    key = key.trim();
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
    if (!key.includes("BEGIN PRIVATE KEY")) return j({ error: "BAD_KEY_FORMAT" }, 500);

    const token = jwt.sign({ aud: "v" }, key, {
      algorithm: "RS256",
      expiresIn: "12h",
      keyid: keyId, // sets 'kid' header
    });

    return j({ url: `https://stream.mux.com/${playbackId}.m3u8?token=${token}` });
  } catch (e: any) {
    console.error("mux/sign error:", e?.message || e);
    return j({ error: "JWT_SIGN_FAILED" }, 500);
  }
}
