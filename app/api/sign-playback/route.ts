import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(req: NextRequest) {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", "https://www.kravtofly.com");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function sign(playbackId: string, ttl = 3600) {
  return jwt.sign(
    { sub: playbackId, aud: "v" },
    process.env.MUX_SIGNING_KEY_SECRET!,
    {
      algorithm: "HS256",
      expiresIn: ttl,
      header: { kid: process.env.MUX_SIGNING_KEY_ID! },
    }
  );
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const headers = cors(req);
  try {
    const url = new URL(req.url);
    const playbackId = url.searchParams.get("playbackId");
    if (!playbackId) return new Response(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
    return Response.json({ token: sign(playbackId) }, { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "sign failed" }), { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const { playbackId } = await req.json();
    if (!playbackId) return new Response(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
    return Response.json({ token: sign(playbackId) }, { headers });
  } catch {
    return new Response(JSON.stringify({ error: "sign failed" }), { status: 500, headers });
  }
}
