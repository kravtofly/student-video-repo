// app/api/sign-playback/route.ts
import { NextResponse } from "next/server";
import { SignJWT, importPKCS8, importPKCS1 } from "jose";

const { MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_SECRET } = process.env as Record<
  string,
  string | undefined
>;

type KeyInfo =
  | { pem: string; fmt: "pkcs8" }
  | { pem: string; fmt: "pkcs1" }
  | null;

function coercePem(secret?: string): KeyInfo {
  if (!secret) return null;
  const raw = secret.trim();
  const toPem = (s: string) => s.trim();

  // Direct PEM in env?
  if (raw.includes("-----BEGIN")) {
    if (raw.includes("-----BEGIN PRIVATE KEY-----")) return { pem: toPem(raw), fmt: "pkcs8" };
    if (raw.includes("-----BEGIN RSA PRIVATE KEY-----")) return { pem: toPem(raw), fmt: "pkcs1" };
    return null; // unknown PEM type
  }

  // Base64-encoded PEM in env?
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.includes("-----BEGIN PRIVATE KEY-----")) return { pem: toPem(decoded), fmt: "pkcs8" };
    if (decoded.includes("-----BEGIN RSA PRIVATE KEY-----")) return { pem: toPem(decoded), fmt: "pkcs1" };
  } catch {
    /* ignore */
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const playbackId = searchParams.get("playback_id")?.trim();

    if (!playbackId) return NextResponse.json({ error: "Missing playback_id" }, { status: 400 });
    if (!MUX_SIGNING_KEY_ID) return NextResponse.json({ error: "Missing MUX_SIGNING_KEY_ID" }, { status: 500 });

    const key = coercePem(MUX_SIGNING_KEY_SECRET);
    if (!key) {
      return NextResponse.json(
        { error: "MUX_SIGNING_KEY_SECRET must be a PEM or base64-encoded PEM (PKCS#8 or PKCS#1)" },
        { status: 500 }
      );
    }

    // Import RSA private key for RS256
    const privateKey =
      key.fmt === "pkcs8"
        ? await importPKCS8(key.pem, "RS256")
        : await importPKCS1(key.pem, "RS256");

    // Build short-lived token: sub=playback_id, aud="v" (video)
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: MUX_SIGNING_KEY_ID })
      .setSubject(playbackId)
      .setAudience("v")
      .setExpirationTime("60s")
      .sign(privateKey);

    return NextResponse.json({ token }, { status: 200 });
  } catch (e: any) {
    console.error("sign-playback error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to sign playback token" }, { status: 500 });
  }
}
