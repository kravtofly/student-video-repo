// app/api/sign-playback/route.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(req: NextRequest) {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", "https://www.kravtofly.com");
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

async function sign(playbackId: string | null, headers: Headers) {
  if (!playbackId) {
    return new Response(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
  }

  const token = jwt.sign(
    { sub: playbackId, exp: Math.floor(Date.now() / 1000) + 60 * 60 }, // 1h
    process.env.MUX_SIGNING_KEY_SECRET!,                                // private key
    { algorithm: "RS256", keyid: process.env.MUX_SIGNING_KEY_ID! }      // key id
  );

  return new Response(JSON.stringify({ token }), { status: 200, headers });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);
  const url = new URL(req.url);
  const playbackId = url.searchParams.get("playbackId");
  return sign(playbackId, headers);
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  const { playbackId } = await req.json().catch(() => ({}));
  return sign(playbackId ?? null, headers);
}
