// app/api/sign-playback/route.ts
import { NextResponse } from "next/server";
import Mux from "@mux/mux-node";

const { MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_SECRET } = process.env as Record<
  string,
  string | undefined
>;

function pemFromEnv(secret?: string): string | null {
  if (!secret) return null;
  const s = secret.trim();
  if (s.includes("-----BEGIN")) return s; // already PEM
  try {
    const decoded = Buffer.from(s, "base64").toString("utf8").trim();
    if (decoded.includes("-----BEGIN")) return decoded; // base64->PEM
  } catch {
    // ignore
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const playbackId = searchParams.get("playback_id")?.trim();

    if (!playbackId) {
      return NextResponse.json({ error: "Missing playback_id" }, { status: 400 });
    }
    if (!MUX_SIGNING_KEY_ID) {
      return NextResponse.json({ error: "Missing MUX_SIGNING_KEY_ID" }, { status: 500 });
    }

    const keySecret = pemFromEnv(MUX_SIGNING_KEY_SECRET);
    if (!keySecret) {
      return NextResponse.json(
        { error: "MUX_SIGNING_KEY_SECRET is not a PEM or base64-encoded PEM" },
        { status: 500 }
      );
    }

    const JwtHelper: any = (Mux as any).Jwt || (Mux as any).JWT;
    if (!JwtHelper) {
      return NextResponse.json(
        { error: "Mux JWT helper not available in @mux/mux-node" },
        { status: 500 }
      );
    }

    const opts = {
      keyId: MUX_SIGNING_KEY_ID,
      keySecret,
      type: "video",
      expiration: 60, // seconds
    };

    const token =
      typeof JwtHelper.signPlaybackId === "function"
        ? JwtHelper.signPlaybackId(playbackId, opts)
        : JwtHelper.sign(playbackId, opts);

    return NextResponse.json({ token }, { status: 200 });
  } catch (e: any) {
    console.error("sign-playback error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to sign playback token" },
      { status: 500 }
    );
  }
}
