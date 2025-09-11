// app/api/sign-playback/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(data: any, req: NextRequest) {
  const h = new Headers({ "Content-Type": "application/json" });
  const o = req.headers.get("origin");
  if (o) h.set("Access-Control-Allow-Origin", o);
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new NextResponse(JSON.stringify(data), { headers: h });
}
function err(status: number, msg: string, req: NextRequest) {
  return ok({ error: msg }, req).clone({ status });
}
export async function OPTIONS(req: NextRequest) { return ok(null, req).clone({ status: 204 }); }

function sign(playbackId: string, ttlSec = 3600) {
  return jwt.sign(
    { sub: playbackId, aud: "v" },
    process.env.MUX_SIGNING_KEY_SECRET!,              // PEM private key
    { algorithm: "RS256", expiresIn: ttlSec, header: { kid: process.env.MUX_SIGNING_KEY_ID! } }
  );
}

export async function GET(req: NextRequest) {
  const playbackId = req.nextUrl.searchParams.get("playbackId");
  if (!playbackId) return err(400, "missing playbackId", req);
  const token = sign(playbackId);
  return ok({ token, url: `https://stream.mux.com/${playbackId}.m3u8?token=${token}` }, req);
}

export async function POST(req: NextRequest) {
  const { playbackId, ttl } = await req.json().catch(() => ({}));
  if (!playbackId) return err(400, "missing playbackId", req);
  const token = sign(playbackId, Number(ttl) || 3600);
  return ok({ token, url: `https://stream.mux.com/${playbackId}.m3u8?token=${token}` }, req);
}
