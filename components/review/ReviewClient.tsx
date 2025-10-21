"use client";

import React from "react";

// Minimal shapes that match your server responses today
type ViewerRole = "coach" | "student";
type Submission = {
  id: string;
  title?: string | null;
  mux_playback_id?: string | null;
  playback_id?: string | null;
  owner_name?: string | null;
  discipline?: string | null;
  description?: string | null;
  review?: { summary?: string | null } | null;
};
type Note = { id: string; t_seconds: number; body: string; created_at: string };

// TS-safe alias for the web component
const MuxPlayer = "mux-player" as any;

export default function ReviewClient({
  submissionId,
  token,
  readOnly,
  viewerRole,
}: {
  submissionId: string;
  token: string | null;       // optional read token if you’re using them elsewhere
  readOnly: boolean;          // student = true, coach = false
  viewerRole: ViewerRole;     // "coach" | "student" (informational)
}) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [submission, setSubmission] = React.useState<Submission | null>(null);
  const [playbackToken, setPlaybackToken] = React.useState<string | null>(null);

  const [notes, setNotes] = React.useState<Note[]>([]);
  const [summary, setSummary] = React.useState<string>("");

  const qs = token ? `?token=${encodeURIComponent(token)}` : "";

  // Load mux-player script once
  React.useEffect(() => {
    if (document.querySelector('script[data-mux-player]')) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@mux/mux-player";
    s.defer = true;
    s.setAttribute("data-mux-player", "1");
    document.head.appendChild(s);
  }, []);

  // Pull submission + playbackToken in ONE request (like the old page)
  async function loadSubmissionAndToken() {
    const res = await fetch(`/api/svr/submission/${encodeURIComponent(submissionId)}${qs}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error || `Failed to load submission (${res.status})`);
    }
    const sub: Submission = json.submission ?? json;
    setSubmission(sub);
    setPlaybackToken(json.playbackToken ?? null);
    setSummary(sub?.review?.summary ?? "");
  }

  async function loadNotes() {
    const res = await fetch(`/api/svr/notes?videoId=${encodeURIComponent(submissionId)}${qs}`, { cache: "no-store" });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    setNotes(json.notes || []);
  }

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadSubmissionAndToken();
        await loadNotes();
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, token]);

  // ----- Coach actions (match your existing API) -----
  async function addNoteAtCurrentTime() {
    if (!submissionId) return;
    const player = document.getElementById("player") as any;
    const t = Math.floor((player?.currentTime || 0) as number);

    const body = window.prompt(`Note @ ${formatTime(t)}`) || "";
    if (!body.trim()) return;

    await fetch("/api/svr/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: submissionId,
        t,
        body,
      }),
    });
    await loadNotes();
  }

  async function markReviewedAndNotify() {
    if (!submissionId) return;
    await fetch("/api/svr/mark-reviewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: submissionId,
        reviewSummary: summary || null,
      }),
    });
    alert("Student notified!");
  }

  // ----- Render -----
  if (loading) return <main className="max-w-5xl mx-auto p-6 text-gray-600">Loading…</main>;
  if (error) return <main className="max-w-5xl mx-auto p-6 text-rose-700 bg-rose-50 rounded-xl border border-rose-200">{error}</main>;
  if (!submission) return <main className="max-w-5xl mx-auto p-6">Submission not found.</main>;

  const playbackId = submission.mux_playback_id || submission.playback_id || "";

  return (
    <main className="mx-auto max-w-[1100px] p-4 md:p-6 font-[system-ui,-apple-system,Segoe UI,Roboto,Arial]">
      {/* Header (matches old page tone) */}
      <h1 className="text-xl font-semibold mb-4">Coach Review</h1>

      {/* Two-column grid like the old page: video left, notes+summary right */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: "1.2fr .8fr" }}>
        {/* Left: video */}
        <div>
          {playbackId && playbackToken ? (
            <MuxPlayer
              id="player"
              style={{ width: "100%", height: "auto", borderRadius: 12, overflow: "hidden" }}
              stream-type="on-demand"
              playback-id={playbackId}
              playback-token={playbackToken}
              controls
              playsinline
            />
          ) : (
            <div className="text-rose-700">Missing playback id or token.</div>
          )}
          <div className="opacity-70 text-xs mt-2">
            {submission.title || ""}
          </div>

          {!readOnly && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={addNoteAtCurrentTime}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-[#fafafa] hover:bg-gray-50"
              >
                Add note at current time
              </button>
            </div>
          )}
        </div>

        {/* Right: notes + summary */}
        <div>
          <h3 className="font-semibold mb-2">Timestamped Notes</h3>
          <div className="my-2">
            {!!notes.length ? (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="px-2 py-1 border border-gray-200 rounded-lg mb-2"
                >
                  <strong className="mr-1">{formatTime(n.t_seconds)}</strong>
                  {n.body}
                </div>
              ))
            ) : (
              <p className="opacity-70">No notes yet.</p>
            )}
          </div>

          <hr className="my-4" />

          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Optional review summary…"
            className="w-full h-24 p-2 rounded-lg border border-gray-300"
          />
          {!readOnly && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={markReviewedAndNotify}
                className="px-3 py-2 rounded-lg border border-[#111] bg-[#111] text-white hover:opacity-90"
              >
                Mark Reviewed & Notify Student
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function formatTime(s: number) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}
