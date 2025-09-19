"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'mux-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'stream-type'?: string;
        'playback-id'?: string;
        'playback-token'?: string;
        playsinline?: boolean;
        controls?: boolean;
        style?: React.CSSProperties;
      };
    }
  }
}

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
