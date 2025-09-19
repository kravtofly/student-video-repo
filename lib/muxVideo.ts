// lib/muxVideo.ts
import Mux from "@mux/mux-node";

const tokenId = process.env.MUX_TOKEN_ID!;
const tokenSecret = process.env.MUX_TOKEN_SECRET!;

if (!tokenId || !tokenSecret) {
  // This file should only be imported in server code
  throw new Error("Missing MUX_TOKEN_ID / MUX_TOKEN_SECRET");
}

export const mux = new Mux({ tokenId, tokenSecret });
export const video = mux.video;
