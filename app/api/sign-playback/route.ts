// app/api/sign-playback/route.ts
import { NextRequest } from "next/server";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowed frontends
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
  h.set("content-type", "application/json");
  return h;
}

function signMuxPlaybackToken(playbackId: string) {
  const kid = process.env.MUX_SIGNING_KEY_ID!;
  let key = process.env.MUX_SIGNING_KEY_SECRET!;
  
  // The key might be base64 encoded, try to decode it
  try {
    if (!key.includes('-----BEGIN')) {
      // It's likely base64 encoded, decode it
      key = Buffer.from(key, 'base64').toString('utf8');
    }
  } catch (decodeError) {
    console.error("Failed to decode PEM key:", decodeError);
    // Use the key as-is if decoding fails
  }
  
  const payload = {
    sub: playbackId,
    aud: "v", // viewer token
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
  };
  
  const options: SignOptions = {
    algorithm: "RS256",
    keyid: kid, // Use keyid instead of header.kid
  };
  
  return jwt.sign(payload, key as Secret, options);
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const headers = cors(req);
  const playbackId = new URL(req.url).searchParams.get("playbackId");
  if (!playbackId) {
    return new Response(JSON.stringify({ error: "missing playbackId" }), {
      status: 400,
      headers,
    });
  }
  try {
    const token = signMuxPlaybackToken(playbackId);
    return new Response(JSON.stringify({ token }), { status: 200, headers });
  } catch (e: any) {
    console.error("sign error", e?.message || e);
    return new Response(JSON.stringify({ error: "sign failed" }), {
      status: 500,
      headers,
    });
  }
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const { playbackId } = await req.json().catch(() => ({}));
  if (!playbackId) {
    return new Response(JSON.stringify({ error: "missing playbackId" }), {
      status: 400,
      headers,
    });
  }
  try {
    const token = signMuxPlaybackToken(playbackId);
    return new Response(JSON.stringify({ token }), { status: 200, headers });
  } catch (e: any) {
    console.error("sign error", e?.message || e);
    return new Response(JSON.stringify({ error: "sign failed" }), {
      status: 500,
      headers,
    });
  }
}
