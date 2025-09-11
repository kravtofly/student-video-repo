// /app/api/sign-playback/route.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(req: NextRequest) {
  const h = new Headers();
  const origin = req.headers.get("origin");
  if (origin === "https://www.kravtofly.com" || process.env.NODE_ENV === "development") {
    h.set("Access-Control-Allow-Origin", origin || "*");
  } else {
    h.set("Access-Control-Allow-Origin", "*");
  }
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const { playbackId, ttl = 3600 } = await req.json();
    if (!playbackId) {
      return new Response(JSON.stringify({ error: "missing playbackId" }), { status: 400, headers });
    }

    // Create a signed token for Mux playback (aud 'v' = video)
    const token = jwt.sign(
      { sub: playbackId, aud: "v" },
      process.env.MUX_SIGNING_KEY_SECRET!, // private key string
      {
        algorithm: "RS256",
        expiresIn: ttl,                       // seconds
        header: { kid: process.env.MUX_SIGNING_KEY_ID! }
      }
    );

    const url = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    return Response.json({ token, url }, { headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "server error" }), { status: 500, headers });
  }
}
