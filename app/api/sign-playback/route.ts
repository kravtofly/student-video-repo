import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { playbackId, ttl } = await req.json();
    if (!playbackId) {
      return NextResponse.json({ error: "missing playbackId" }, { status: 400 });
    }

    const token = jwt.sign(
      { sub: playbackId },
      process.env.MUX_SIGNING_KEY_SECRET!,          // secret from Mux Signing Key
      {
        algorithm: "HS256",
        expiresIn: `${ttl ?? 600}s`,                // default 10 minutes
        header: { kid: process.env.MUX_SIGNING_KEY_ID! } // key id from Mux
      }
    );

    return NextResponse.json({ token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}
