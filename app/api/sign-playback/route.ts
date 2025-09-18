import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowed frontends (adjust if needed)
const ALLOWED = new Set([
  "https://www.kravtofly.com",
  "https://kravtofly.com",
  "http://localhost:3000",
]);

function cors(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED.has(origin) ? origin : "https://www.kravtofly.com";
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", allow);
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function signMuxPlaybackToken(playbackId: string) {
  const kid = process.env.MUX_SIGNING_KEY_ID!;
  const key = process.env.MUX_SIGNING_KEY_SECRET!; // RSA private key (paste full multiline value)
  const exp = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
  return jwt.sign(
    { sub: playbackId, exp, aud: "v" },
    key,
    { algorithm: "RS256", header: { kid } }
  );
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const headers = cors(req);
  const playbackId = new URL(req.url).searchParams.get("playbackId");
  if (!playbackId) return new Response(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
  try {
    const token = signMuxPlaybackToken(playbackId);
    return new Response(JSON.stringify({ token }), { status: 200, headers });
  } catch (e: any) {
    console.error("sign error", e?.message || e);
    return new Response(JSON.stringify({ error: "sign failed" }), { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const { playbackId } = await req.json().catch(() => ({}));
  if (!playbackId) return new Response(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
  try {
    const token = signMuxPlaybackToken(playbackId);
    return new Response(JSON.stringify({ token }), { status: 200, headers });
  } catch (e: any) {
    console.error("sign error", e?.message || e);
    return new Response(JSON.stringify({ error: "sign failed" }), { status: 500, headers });
  }
}
