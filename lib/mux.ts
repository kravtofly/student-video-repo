// lib/mux.ts
import Mux from "@mux/mux-node";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export const video = mux.video;          // grouped video client

// Export the full Mux object for webhook verification access
export { Mux };
