// app/api/sign-playback/route.ts
import { NextResponse } from "next/server";
import Mux from "@mux/mux-node";

// Expect these to be set in Vercel → Project Settings → Environment Variables
const { MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_SECRET } = process.env;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const playbackId = searchParams.get("playback_id");
    if (!playbackId) {
      return NextResponse.json({ error: "Missing playback_id" }, { status: 400 });
    }

    // Mux dashboard gives the signing key *secret* base64-encoded.
    // Decode if it doesn't already look like a PEM.
    const rawSecret = MUX_SIGNING_KEY_SECRET ?? "";
    const keySecret = rawSecret.includes("-----BEGIN")
      ? rawSecret
      : Buffer.from(rawSecret, "base64").toString("utf8");

    // Create a short-lived token for signed playback
    // (You can adjust expiration to taste; 60–120s is a common choice.)
    const token = Mux.JWT.signPlaybackId(playbackId, {
      keyId: MUX_SIGNING_KEY_ID!,
      keySecret,
      expiration: 60,
    });

    return NextResponse.json({ token }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to sign playback token" }, { status: 500 });
  }
}
