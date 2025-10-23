// app/api/mux/sign/route.ts
import type { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { createPrivateKey } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const J = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json" },
  });

function looksBase64(s: string) {
  return s.length > 80 && !s.includes("\n") && /^[A-Za-z0-9+/=]+$/.test(s);
}

function normalizePem(raw: string) {
  let key = (raw || "").trim();
  if (looksBase64(key)) {
    try {
      key = Buffer.from(key, "base64").toString("utf8");
    } catch {}
  }
  key = key
    .replace(/BEGIN_PRIVATE_KEY/g, "BEGIN PRIVATE KEY")
    .replace(/END_PRIVATE_KEY/g, "END PRIVATE KEY")
    .replace(/BEGIN_RSA_PRIVATE_KEY/g, "BEGIN RSA PRIVATE KEY")
    .replace(/END_RSA_PRIVATE_KEY/g, "END RSA PRIVATE KEY");
  if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
  return key;
}

export async function POST(req: NextRequest) {
  try {
    const { playbackId } = await req.json().catch(() => ({}));
    if (!playbackId) return J({ error: "MISSING_PLAYBACK_ID" }, 400);

    const keyId = process.env.MUX_SIGNING_KEY_ID;
    let key = process.env.MUX_SIGNING_KEY_SECRET || "";
    if (!keyId || !key) return J({ error: "NO_ENV" }, 500);

    key = normalizePem(key);
    const hasPem =
      key.includes("BEGIN PRIVATE KEY") || key.includes("BEGIN RSA PRIVATE KEY");
    if (!hasPem) return J({ error: "BAD_KEY_FORMAT" }, 500);

    const keyObj = createPrivateKey({ key, format: "pem" });

    const token = await new SignJWT({ aud: "v", sub: playbackId })
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(keyObj as any);

    return J({ url: `https://stream.mux.com/${playbackId}.m3u8?token=${token}` });
  } catch (e: any) {
    console.error("mux/sign error:", e?.message || e);
    return J({ error: "JWT_SIGN_FAILED" }, 500);
  }
}
