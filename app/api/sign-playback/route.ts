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

    // Mux dashboard usually stores the private key as base64; decode to PEM if needed.
    const rawSecret = MUX_SIGNING_KEY_SECRET ?? "";
    const keySecret = rawSecret.includes("-----BEGIN")
      ? rawSecret
      : Buffer.from(rawSecret, "base64").toString("utf8");

    // Support both historical and current helper names without fighting types
    const JwtHelper: any = (Mux as any).Jwt || (Mux as any).JWT;
    if (!JwtHelper) {
      throw new Error("Mux JWT helper not available on @mux/mux-node");
    }

    const opts = {
      keyId: MUX_SIGNING_KEY_ID!,
      keySecret,
      // `expiration` maps to `expiresIn` under the hood in older helpers
      // e.g. "60" == 60 seconds. Adjust to taste.
      expiration: 60,
    };

    const token = typeof JwtHelper.signPlaybackId === "function"
      ? JwtHelper.signPlaybackId(playbackId, opts)
      : JwtHelper.sign(playbackId, opts); // fallback used in older docs

    return NextResponse.json({ token }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to sign playback token" }, { status: 500 });
  }
}
