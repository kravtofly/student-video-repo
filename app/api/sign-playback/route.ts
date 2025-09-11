// app/api/sign-playback/route.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_ORIGIN = "https://www.kravtofly.com";

function cors(h = new Headers()) {
  h.set("Access-Control-Allow-Origin", CORS_ORIGIN);
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function GET(req: NextRequest) {
  const headers = cors(new Headers({ "Content-Type": "application/json" }));
  const playbackId = req.nextUrl.searchParams.get("playbackId");
  if (!playbackId) return new Response(JSON.stringify({ error: "Missing playbackId" }), { status: 400, headers });

  try {
    const token = jwt.sign(
      { sub: playbackId },                              // subject = playbackId
      process.env.MUX_SIGNING_KEY_SECRET!,             // Signing Key secret (private key)
      {
        algorithm: "RS256",
        keyid: process.env.MUX_SIGNING_KEY_ID!,        // Signing Key ID
        expiresIn: "12h",
      }
    );
    return new Response(JSON.stringify({ token }), { headers });
  } catch (e) {
    console.error("sign error", e);
    return new Response(JSON.stringify({ error: "sign failed" }), { status: 500, headers });
  }
}
