"use client";
import Script from "next/script";

export default function ClientMuxPlayer({
  playbackId,
  token,
}: { playbackId: string; token: string }) {
  return (
    <>
      <Script
        type="module"
        src="https://unpkg.com/@mux/mux-player@latest"
        strategy="afterInteractive"
      />
      <mux-player
        stream-type="on-demand"
        playback-id={playbackId}
        playback-token={token}
        playsinline
        controls
        style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12 }}
      />
    </>
  );
}
