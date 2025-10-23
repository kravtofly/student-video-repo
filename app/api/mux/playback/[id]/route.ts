// app/api/mux/playback/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

const KEY_ID = process.env.MUX_SIGNING_KEY_ID!;
const KEY_SECRET = process.env.MUX_SIGNING_KEY_SECRET!;

async function signPlaybackToken(playbackId: string, ttlSeconds = 60 * 60) {
  // Mux requires HS256 with kid header and { aud: 'v', sub: playbackId }
  const secretKey = new TextEncoder().encode(KEY_SECRET);
  return new SignJWT({ aud: "v", sub: playbackId })
    .setProtectedHeader({ alg: "HS256", kid: KEY_ID })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const playbackId = params.id;
    if (!playbackId) {
      return NextResponse.json({ error: "Missing playbackId" }, { status: 400 });
    }
    if (!KEY_ID || !KEY_SECRET) {
      return NextResponse.json(
        { error: "MUX_SIGNING_KEY_ID / MUX_SIGNING_KEY_SECRET not set" },
        { status: 500 }
      );
    }

    const token = await signPlaybackToken(playbackId);
    const signedUrl = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;

    // Return BOTH to keep the client flexible
    return NextResponse.json({
      playbackId,
      playbackToken: token,
      signedUrl,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
