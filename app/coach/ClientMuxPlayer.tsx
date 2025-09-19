"use client";
import Script from "next/script";

export default function ClientMuxPlayer({
  playbackId,
  token,
}: {
  playbackId: string;
  token: string;
}) {
  return (
    <>
      <Script src="https://unpkg.com/@mux/mux-player" strategy="afterInteractive" />
      {/* TypeScript may not know about the custom element. If you see a TS error, see note below. */}
      <mux-player
        stream-type="on-demand"
        playback-id={playbackId}
        playback-token={token}
        playsinline
        style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12 }}
        controls
      />
    </>
  );
}
