"use client";

import React from "react";

type ViewerRole = "coach" | "student";

interface Submission {
  id: string;
  title?: string;
  owner_email?: string;
  owner_name?: string;
  mux_asset_id?: string;
  mux_playback_id?: string;
  status?: string;
  review?: { summary?: string } | null;
}

interface Note {
  id: string;
  at: number; // seconds
  text: string;
  created_at?: string;
}

export default function ReviewClient({
  submissionId,
  token,
  readOnly,
  viewerRole,
}: {
  submissionId: string;
  token: string | null;
  readOnly: boolean;
  viewerRole: ViewerRole;
}) {
  const [loading, setLoading] = React.useState(true);
  const [submission, setSubmission] = React.useState<Submission | null>(null);
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [summary, setSummary] = React.useState<string>("");
  const [videoSrc, setVideoSrc] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";

  async function load() {
    try {
      setLoading(true);
      setError(null);

      // 1) Submission
      const subRes = await fetch(
        `/api/svr/submission/${encodeURIComponent(submissionId)}${qs}`,
        { cache: "no-store" }
      );
      if (!subRes.ok) throw new Error(`Failed to load submission (${subRes.status})`);
      const subJson = await subRes.json();
      const sub: Submission = subJson?.submission ?? subJson;
      setSubmission(sub);
      setSummary(sub?.review?.summary ?? "");

      // 2) Notes
      const notesRes = await fetch(`/api/svr/notes?videoId=${encodeURIComponent(submissionId)}${qs}`, { cache: "no-store" });
      if (!notesRes.ok) throw new Error(`Failed to load notes (${notesRes.status})`);
      const notesJson = await notesRes.json();
      setNotes(notesJson?.notes ?? notesJson ?? []);

      // 3) Mux playback (signed URL or HLS)
      const muxRes = await fetch(
        `/api/svr/mux-playback?submissionId=${encodeURIComponent(submissionId)}${qs}`,
        { cache: "no-store" }
      );
      if (!muxRes.ok) throw new Error(`Failed to load playback token (${muxRes.status})`);
      const muxJson = await muxRes.json();
      setVideoSrc(muxJson?.signedUrl ?? muxJson?.hls ?? muxJson?.src ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, token]);

  async function addNote(atSeconds: number, text: string) {
    const body = { videoId: submissionId, at: atSeconds, text, token };
    const r = await fetch("/api/svr/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("Failed to add note");
    const j = await r.json();
    setNotes((prev) => [j.note, ...prev]);
  }

  async function markReviewedAndNotify() {
    const r = await fetch("/api/svr/mark-reviewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    });
    if (!r.ok) throw new Error("Failed to mark reviewed");
    await load();
    // eslint-disable-next-line no-alert
    alert("Student notified.");
  }

  function handleNoteClick(n: Note) {
    if (videoRef.current) {
      videoRef.current.currentTime = n.at;
      videoRef.current.focus();
      void videoRef.current.play().catch(() => {});
    }
  }

  if (loading) return <div className="p-6 text-gray-600">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!submission) return <div className="p-6">Submission not found.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 grid md:grid-cols-5 gap-6">
      {/* Player */}
      <div className="md:col-span-3">
        <div className="bg-black rounded-2xl overflow-hidden shadow">
          {videoSrc ? (
            <video
              ref={videoRef}
              className="w-full h-auto"
              src={videoSrc}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="p-8 text-white text-center">No video source available.</div>
          )}
        </div>

        {/* Coach-only toolbar */}
        {!readOnly && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AddNoteForm onAdd={addNote} videoRef={videoRef} />
            <button
              onClick={markReviewedAndNotify}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
            >
              Mark Reviewed &amp; Notify Student
            </button>
          </div>
        )}
      </div>

      {/* Notes + Summary */}
      <div className="md:col-span-2 space-y-6">
        <section>
          <h2 className="text-lg font-semibold">Timestamped Notes</h2>
          <p className="text-sm text-gray-500 mt-1">
            Click a note to jump the video to that moment.
          </p>
          <ul className="mt-3 space-y-2">
            {notes.length === 0 && <li className="text-gray-500">No notes yet.</li>}
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  className="w-full text-left px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50"
                  onClick={() => handleNoteClick(n)}
                >
                  <span className="font-mono text-xs mr-2 bg-gray-100 px-2 py-0.5 rounded">
                    {formatTime(n.at)}
                  </span>
                  <span className="align-middle">{n.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Coach’s Summary</h2>
          <p className="text-sm text-gray-500 mt-1">High-level takeaways and next steps.</p>
          {readOnly ? (
            <div className="mt-3 whitespace-pre-wrap text-gray-800 bg-gray-50 rounded-xl p-3 border border-gray-200 min-h-[96px]">
              {summary || <span className="text-gray-400">No summary yet.</span>}
            </div>
          ) : (
            <textarea
              className="mt-3 w-full rounded-xl border border-gray-300 p-3 min-h-[140px] focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Write a short summary for the student…"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function AddNoteForm({
  onAdd,
  videoRef,
}: {
  onAdd: (atSeconds: number, text: string) => Promise<void>;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function handleAdd() {
    const clean = text.trim();
    if (!clean) return;
    const at = Math.floor(videoRef.current?.currentTime ?? 0);
    try {
      setBusy(true);
      await onAdd(at, clean);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleAdd}
        disabled={busy || !text.trim()}
        className="px-3 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
      >
        + Add note @ current time
      </button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Quick note…"
        className="w-64 px-3 py-2 rounded-xl border border-gray-300"
      />
    </div>
  );
}

function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
