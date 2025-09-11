import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(req: NextRequest) {
  const h = new Headers({ "Content-Type": "application/json" });
  const o = req.headers.get("origin");
  if (o) h.set("Access-Control-Allow-Origin", o);
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function signHS256(playbackId: string, ttlSec = 3600) {
  return jwt.sign(
    { sub: playbackId, aud: "v" },
    process.env.MUX_SIGNING_KEY_SECRET!,   // string secret from Mux Signing Key
    { algorithm: "HS256", expiresIn: ttlSec, header: { kid: process.env.MUX_SIGNING_KEY_ID! } }
  );
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const headers = cors(req);
  const playbackId = req.nextUrl.searchParams.get("playbackId");
  if (!playbackId) return new NextResponse(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
  try {
    const token = signHS256(playbackId);
    return new NextResponse(JSON.stringify({ token, url: `https://stream.mux.com/${playbackId}.m3u8?token=${token}` }), { headers });
  } catch (e: any) {
    console.error("sign error:", e?.message || e);
    return new NextResponse(JSON.stringify({ error: "sign failed" }), { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const { playbackId, ttl } = await req.json();
    if (!playbackId) return new NextResponse(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
    const token = signHS256(playbackId, Number(ttl) || 3600);
    return new NextResponse(JSON.stringify({ token, url: `https://stream.mux.com/${playbackId}.m3u8?token=${token}` }), { headers });
  } catch (e: any) {
    console.error("sign error:", e?.message || e);
    return new NextResponse(JSON.stringify({ error: "sign failed" }), { status: 500, headers });
  }
}
