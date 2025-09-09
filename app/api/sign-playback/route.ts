import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  const { playbackId } = await req.json();
  const token = jwt.sign(
    { sub: playbackId, kid: "signed" },
    process.env.MUX_TOKEN_SECRET!,     // For real use, create a separate Playback Signing Key in Mux
    { algorithm: "HS256", expiresIn: "10m" }
  );
  return NextResponse.json({ token });
}
