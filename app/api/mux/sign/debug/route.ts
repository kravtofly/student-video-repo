import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function J(d: unknown, s = 200) {
  return new Response(JSON.stringify(d, null, 2), {
    status: s,
    headers: { "content-type": "application/json" },
  });
}
function normalizePem(raw: string) {
  let key = (raw || "").trim();
  if (key.length > 80 && !key.includes("\n") && /^[A-Za-z0-9+/=]+$/.test(key)) {
    try { key = Buffer.from(key, "base64").toString("utf8"); } catch {}
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
  const pid = new URL(req.url).searchParams.get("pid") || "";
  if (!pid) return J({ error: "MISSING_PLAYBACK_ID" }, 400);

  const kid = process.env.MUX_SIGNING_KEY_ID || null;
  let key = process.env.MUX_SIGNING_KEY_SECRET || "";
  if (!kid || !key) return J({ error: "NO_ENV" }, 500);

  key = normalizePem(key);
  try {
    const token = jwt.sign({ aud: "v", sub: pid }, key, {
      algorithm: "RS256",
      expiresIn: "1h",
      keyid: kid,
    });
    const decoded: any = jwt.decode(token, { complete: true });
    return J({
      playbackId: pid,
      header: decoded?.header,
      payload: decoded?.payload, // shows aud/sub/exp
      test_url: `https://stream.mux.com/${pid}.m3u8?token=${token}`,
    });
  } catch (e: any) {
    return J({ error: "JWT_SIGN_FAILED", message: e?.message || String(e) }, 500);
  }
}
