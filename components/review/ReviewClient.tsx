"use client";

import React from "react";

type ViewerRole = "coach" | "student";

type Submission = {
  id: string;
  title?: string | null;
  mux_playback_id?: string | null;
  playback_id?: string | null;
  owner_name?: string | null;
  review?: { summary?: string | null } | null;
};

type Note = { id: string; t_seconds: number; body: string; created_at: string };

// TS-friendly alias for the web component
const MuxPlayer = "mux-player" as any;

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
  const [error, setError] = React.useState<string | null>(null);

  const [submission, setSubmission] = React.useState<Submission | null>(null);
  const [playbackToken, setPlaybackToken] = React.useState<string | null>(null);

  const [notes, setNotes] = React.useState<Note[]>([]);
  const [summary, setSummary] = React.useState<string>("");

  // inline Add Note UI
  const [noteText, setNoteText] = React.useState("");
  const [savingNote, setSavingNote] = React.useState(false);

  // coachEmail comes from Webflow dashboard link: ?coachEmail=...
  const coachEmail = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    const qs = new URLSearchParams(window.location.search);
    return qs.get("coachEmail") || "";
  }, []);

  const qs = token ? `?token=${encodeURIComponent(token)}` : "";

  // load mux-player script once
  React.useEffect(() => {
    if (document.querySelector('script[data-mux-player]')) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@mux/mux-player";
    s.defer = true;
    s.setAttribute("data-mux-player", "1");
    document.head.appendChild(s);
  }, []);

  function getPlaybackId(sub: Submission | null | undefined) {
    return (sub?.mux_playback_id || (sub as any)?.playback_id || "") as string;
  }

  async function loadSubmissionAndToken() {
    const res = await fetch(
      `/api/svr/submission/${encodeURIComponent(submissionId)}${qs}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error || `Failed to load submission (${res.status})`);
    }
    const sub: Submission = json.submission ?? json;
    setSubmission(sub);
    setSummary(sub?.review?.summary ?? "");
    setPlaybackToken(json.playbackToken ?? null); // <- matches your legacy API
  }

  async function loadNotes() {
    const res = await fetch(
      `/api/svr/notes?videoId=${encodeURIComponent(submissionId)}${qs}`,
      { cache: "no-store" }
    );
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

  // ---------- Coach actions ----------
  async function addNoteAtCurrentTime() {
    if (!submissionId) return;

    const player = document.getElementById("player") as any;
    const t = Math.floor((player?.currentTime || 0) as number);
    const body = noteText.trim();
    if (!body) return;

    try {
      setSavingNote(true);
      const r = await fetch("/api/svr/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: submissionId,
          coachEmail,        // <- REQUIRED by your existing API
          t,                 // seconds
          body,              // note text
        }),
      });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "Failed to save note");
      setNoteText("");
      await loadNotes();
    } finally {
      setSavingNote(false);
    }
  }

  async function markReviewedAndNotify() {
    if (!submissionId) return;
    const r = await fetch("/api/svr/mark-reviewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: submissionId,
        coachEmail,          // many backends also check this
        reviewSummary: summary || null,
      }),
    });
    const j = await r.json();
    if (!r.ok || j?.error) throw new Error(j?.error || "Failed to mark reviewed");
    alert("Student notified!");
  }

  // ---------- Render ----------
  if (loading) {
    return <main className="max-w-5xl mx-auto p-6 text-gray-600">Loading…</main>;
  }
  if (error) {
    return (
      <main className="max-w-5xl mx-auto p-6 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
        {error}
      </main>
    );
  }
  if (!submission) {
    return <main className="max-w-5xl mx-auto p-6">Submission not found.</main>;
  }

  const playbackId = getPlaybackId(submission);

  return (
    <main className="mx-auto max-w-[1100px] p-4 md:p-6 font-[system-ui,-apple-system,Segoe UI,Roboto,Arial]">
      {/* Header */}
      <h1 className="text-xl font-semibold mb-4">Coach Review</h1>

      {/* Two-column grid (video left, notes+summary right) */}
      <div className="grid gap-5 items-start md:grid-cols-[1.2fr_.8fr]">
        {/* LEFT: Player card */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-black">
          {playbackId && playbackToken ? (
            <MuxPlayer
              id="player"
              style={{ width: "100%", height: "auto" }}
              stream-type="on-demand"
              playback-id={playbackId}
              playback-token={playbackToken}
              controls
              playsinline
            />
          ) : (
            <div className="p-8 text-white text-center">
              Missing playback id or token.
            </div>
          )}
          <div className="p-2 bg-white text-xs text-gray-600">{submission.title || ""}</div>
        </div>

        {/* RIGHT: Notes + Summary */}
        <div className="space-y-5">
          {/* Notes */}
          <section className="rounded-2xl border border-gray-200 p-4 bg-white">
            <h3 className="font-semibold mb-2">Timestamped Notes</h3>

            {!readOnly && (
              <div className="flex gap-2 mb-3">
                <input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write a quick note…"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300"
                />
                <button
                  onClick={addNoteAtCurrentTime}
                  disabled={savingNote || !noteText.trim()}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-[#fafafa] hover:bg-gray-50 disabled:opacity-50"
                >
                  Save @ current time
                </button>
              </div>
            )}

            {notes.length === 0 ? (
              <p className="text-gray-500">No notes yet.</p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button
                      className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                      onClick={() => {
                        const player = document.getElementById("player") as any;
                        if (player && typeof player.currentTime === "number") {
                          player.currentTime = n.t_seconds;
                          player.play?.();
                        }
                      }}
                    >
                      <span className="font-mono text-xs mr-2 bg-gray-100 px-2 py-0.5 rounded">
                        {formatTime(n.t_seconds)}
                      </span>
                      <span>{n.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Summary */}
          <section className="rounded-2xl border border-gray-200 p-4 bg-white">
            <h3 className="font-semibold mb-2">Coach’s Summary</h3>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Optional review summary…"
              className="w-full h-28 p-3 rounded-lg border border-gray-300"
              disabled={readOnly}
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
          </section>
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
