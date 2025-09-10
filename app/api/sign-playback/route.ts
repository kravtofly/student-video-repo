import { NextRequest, NextResponse } from "next/server";
import jwt, { type JwtHeader, type SignOptions } from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const { playbackId } = await req.json();
  if (!playbackId) {
    return NextResponse.json({ error: "playbackId required" }, { status: 400, headers: cors(req) });
  }

  const header: JwtHeader = {
    kid: process.env.MUX_SIGNING_KEY_ID!,
    alg: "HS256",                    // <-- required by types
  };
  const opts: SignOptions = {
    algorithm: "HS256",
    expiresIn: "10m",
    header,
  };

  const token = jwt.sign({ sub: playbackId }, process.env.MUX_SIGNING_KEY_SECRET!, opts);
  return NextResponse.json({ token }, { headers: cors(req) });
}
