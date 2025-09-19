// app/coach/video-grid.tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

// Load Mux Player only on the client
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

type Video = {
  id: string;
  title: string | null;
  playback_id: string | null;
  asset_id: string | null;
  owner_id: string | null;
  created_at: string;
};

export default function VideoGrid({ videos }: { videos: Video[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tokenByPlaybackId, setTokenByPlaybackId] = useState<Record<string, string>>({});

  const getToken = useCallback(async (playbackId: string) => {
    const r = await fetch(`/api/sign-playback?playback_id=${encodeURIComponent(playbackId)}`);
    if (!r.ok) throw new Error(await r.text());
    const { token } = await r.json();
    setTokenByPlaybackId((m) => ({ ...m, [playbackId]: token }));
  }, []);

  const cards = useMemo(
    () =>
      videos.map((v) => {
        const isActive = activeId === v.id;
        const pid = v.playback_id ?? "";
        const signedSrc =
          pid && tokenByPlaybackId[pid]
            ? `https://stream.mux.com/${pid}.m3u8?token=${encodeURIComponent(
                tokenByPlaybackId[pid]
              )}`
            : undefined;

        return (
          <div key={v.id} className="rounded-2xl border p-3 shadow-sm transition hover:shadow">
            <div className="mb-2 text-sm text-gray-500">
              {new Date(v.created_at).toLocaleString()}
            </div>
            <div className="mb-3 font-medium">{v.title ?? `Video ${v.id.slice(0, 6)}`}</div>

            {!pid ? (
              <div className="text-sm text-gray-500">Preparing playback…</div>
            ) : !isActive ? (
              <button
                className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
                onClick={async () => {
                  setActiveId(v.id);
                  if (!tokenByPlaybackId[pid]) {
                    try {
                      await getToken(pid);
                    } catch (e) {
                      console.error(e);
                      alert("Could not get playback token.");
                      setActiveId(null);
                    }
                  }
                }}
              >
                Play
              </button>
            ) : (
              <div className="aspect-video w-full">
                <MuxPlayer
                  streamType="on-demand"
                  src={signedSrc}
                  poster={`https://image.mux.com/${pid}/thumbnail.webp`}
                  autoPlay
                  style={{ width: "100%", height: "100%", borderRadius: 12 }}
                  onError={(e: any) => console.error("Mux error", e)}
                />
              </div>
            )}
          </div>
        );
      }),
    [videos, activeId, tokenByPlaybackId, getToken]
  );

  if (!videos.length) return <div className="text-gray-600">No videos yet.</div>;

  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{cards}</div>;
}
