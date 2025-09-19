// app/api/sign-playback/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const { MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_SECRET } = process.env as Record<
  string,
  string | undefined
>;

// Accept either a PEM or a base64-encoded PEM from env
function coercePem(secret?: string): string | null {
  if (!secret) return null;
  const s = secret.trim();
  if (s.includes("-----BEGIN")) return s; // already PEM (PKCS#8 or PKCS#1)
  try {
    const decoded = Buffer.from(s, "base64").toString("utf8").trim();
    if (decoded.includes("-----BEGIN")) return decoded;
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

    const pem = coercePem(MUX_SIGNING_KEY_SECRET);
    if (!pem) {
      return NextResponse.json(
        { error: "MUX_SIGNING_KEY_SECRET must be a PEM or base64-encoded PEM" },
        { status: 500 }
      );
    }

    // RS256 JWT for Mux signed playback:
    // - header.kid = Signing Key ID
    // - sub = playback_id
    // - aud = "v"
    // - exp = 60s (adjust as needed)
    const token = jwt.sign(
      {},                    // no custom claims needed
      pem,                   // RSA private key (PKCS#1 or PKCS#8)
      {
        algorithm: "RS256",
        keyid: MUX_SIGNING_KEY_ID,
        subject: playbackId,
        audience: "v",
        expiresIn: 60,       // seconds
      }
    );

    return NextResponse.json({ token }, { status: 200 });
  } catch (e: any) {
    console.error("sign-playback error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to sign playback token" }, { status: 500 });
  }
}
