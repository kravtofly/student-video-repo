"use client";

import { useEffect, useRef, useState } from "react";

type Comment = { id: string; t_seconds: number; body: string; created_at: string };

export default function CoachReviewClient({
  videoId,
  playbackId,
}: { videoId: string; playbackId: string | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [src, setSrc] = useState<string>("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newBody, setNewBody] = useState("");
  const [busy, setBusy] = useState(false);

  // Sign playback on mount
  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!playbackId) return;
      const r = await fetch("/api/mux/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbackId }),
      });
      const j = await r.json();
      if (!cancelled && j.url) setSrc(j.url);
    }
    go();
    return () => { cancelled = true; };
  }, [playbackId]);

  // Load comments
  async function loadComments() {
    const r = await fetch(`/api/videos/${encodeURIComponent(videoId)}/comments`);
    const j = await r.json();
    setComments(j.comments || []);
  }

  useEffect(() => { loadComments(); }, [videoId]);

  function mmss(t: number) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (v) { v.currentTime = t; v.play(); }
  }

  async function addNote() {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    const body = newBody.trim();
    if (!body) return;

    setBusy(true);
    try {
      const r = await fetch(`/api/videos/${encodeURIComponent(videoId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t_seconds: Number(t.toFixed(3)), body }),
      });
      const j = await r.json();
      if (j.comment) {
        setComments((c) => [...c, j.comment].sort((a,b)=>a.t_seconds-b.t_seconds));
        setNewBody("");
      } else {
        alert(j.error || "Failed to save comment");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
      <div className="md:col-span-3">
        {/* Use native video for simplicity; HLS works in Safari; for Chrome use hls.js (future) */}
        <video
          ref={videoRef}
          controls
          playsInline
          className="w-full rounded-xl border"
          src={src}
        />
      </div>

      <div className="md:col-span-2">
        <div className="mb-2 font-semibold">Add note at current time</div>
        <textarea
          className="w-full p-3 border rounded-lg min-h-[90px]"
          placeholder="Type your feedback…"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
        />
        <button
          onClick={addNote}
          disabled={busy || !newBody.trim()}
          className="mt-2 w-full py-2 rounded-lg bg-gray-800 text-white font-semibold disabled:opacity-60"
        >
          Add note
        </button>

        <div className="mt-6 mb-2 font-semibold">Notes</div>
        <ul className="space-y-2 max-h-[50vh] overflow-auto pr-1">
          {comments.map((c) => (
            <li key={c.id} className="p-2 border rounded-lg">
              <button
                onClick={() => seekTo(c.t_seconds)}
                className="text-sm font-mono px-2 py-1 rounded bg-gray-100 mr-2"
                title="Jump to time"
              >
                {mmss(Number(c.t_seconds))}
              </button>
              <span>{c.body}</span>
            </li>
          ))}
          {comments.length === 0 && <li className="text-sm text-gray-500">No notes yet.</li>}
        </ul>
      </div>
    </div>
  );
}
