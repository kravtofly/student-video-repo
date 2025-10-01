// app/api/mux/sign/debug/route.ts
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const J = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pid = url.searchParams.get("pid") || "";
  if (!pid) return J({ error: "MISSING_PLAYBACK_ID" }, 400);

  const keyId = process.env.MUX_SIGNING_KEY_ID;
  let key = process.env.MUX_SIGNING_KEY_SECRET || "";
  if (!keyId || !key) return J({ error: "NO_ENV" }, 500);

  try {
    key = normalizePem(key);
    const hasPem =
      key.includes("BEGIN PRIVATE KEY") || key.includes("BEGIN RSA PRIVATE KEY");
    if (!hasPem) return J({ error: "BAD_KEY_FORMAT" }, 500);

    // FIXED: Added sub: pid
    const token = jwt.sign(
      { aud: "v", sub: pid },
      key,
      { algorithm: "RS256", expiresIn: "1h", keyid: keyId }
    );

    const decoded: any = jwt.decode(token, { complete: true }) || {};

    return J({
      playbackId: pid,
      header: decoded.header,
      payload: decoded.payload,
      test_url: `https://stream.mux.com/${pid}.m3u8?token=${token}`
    });
  } catch (e: any) {
    return J({ error: "JWT_SIGN_FAILED", message: e?.message || String(e) }, 500);
  }
}
