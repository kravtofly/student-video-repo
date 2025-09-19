// app/api/sign-playback/route.ts
import { NextResponse } from "next/server";
import Mux from "@mux/mux-node";

const { MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_SECRET } = process.env;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const playbackId = searchParams.get("playback_id");
    if (!playbackId) {
      return NextResponse.json({ error: "Missing playback_id" }, { status: 400 });
    }

    // Mux dashboard provides the secret base64-encoded (unless you saved the PEM).
    const rawSecret = MUX_SIGNING_KEY_SECRET ?? "";
    const keySecret = rawSecret.includes("-----BEGIN")
      ? rawSecret
      : Buffer.from(rawSecret, "base64").toString("utf8");

    // Short-lived signed playback token
    const token = Mux.Jwt.signPlaybackId(playbackId, {
      keyId: MUX_SIGNING_KEY_ID!,
      keySecret,
      expiration: 60, // seconds; adjust as needed
    });

    return NextResponse.json({ token }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to sign playback token" }, { status: 500 });
  }
}
