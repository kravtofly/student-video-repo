"use client";

import React from "react";

/** ---------- Types ---------- */
type ViewerRole = "coach" | "student";

type Submission = {
  id: string;
  title?: string | null;
  mux_playback_id?: string | null; // current
  playback_id?: string | null;     // legacy alias
  owner_name?: string | null;
  review?: { summary?: string | null } | null;
};

type Note = {
  id: string;
  t_seconds: number;
  body: string;
  created_at: string;
};

// web component alias
const MuxPlayer = "mux-player" as any;

/** ---------- Helpers ---------- */
function getPlaybackId(sub?: Submission | null) {
  return (sub?.mux_playback_id || sub?.playback_id || "") as string;
}

/** ONLY legacy keys for POST /api/svr/notes */
function buildLegacyNotePayload(args: {
  submissionId: string;
  coachEmail?: string | null;
  t: number; // seconds
  body: string;
  token?: string | null;
}) {
  const { submissionId, coachEmail, t, body, token } = args;
  return {
    videoId: submissionId,
    at: Math.max(0, Math.floor(t)), // number, integer
    text: body,
    // optional
    coachEmail: coachEmail || undefined,
    token: token || undefined,
  };
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
  const [error, setError] = React.useState<string | null>(null);

  const [submission, setSubmission] = React.useState<Submission | null>(null);
  const [playbackToken, setPlaybackToken] = React.useState<string | null>(null);

  const [notes, setNotes] = React.useState<Note[]>([]);
  const [summary, setSummary] = React.useState<string>("");

  const [noteText, setNoteText] = React.useState("");
  const [savingNote, setSavingNote] = React.useState(false);

  // Webflow dashboard passes this
  const coachEmail = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    const qs = new URLSearchParams(window.location.search);
    return qs.get("coachEmail") || "";
  }, []);

  // load mux-player once
  React.useEffect(() => {
    if (document.querySelector('script[data-mux-player]')) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@mux/mux-player";
    s.defer = true;
    s.setAttribute("data-mux-player", "1");
    document.head.appendChild(s);
  }, []);

  /** Fetch submission + playback token */
  async function loadSubmissionAndToken() {
    // GETs can still use ?token=… if your route supports it
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const res = await fetch(
      `/api/svr/submission/${encodeURIComponent(submissionId)}${qs}`,
      { cache: "no-store" }
    );

    const txt = await res.text();
    let json: any;
    try {
      json = JSON.parse(txt);
    } catch {
      throw new Error(`Submission response not JSON (${res.status})`);
    }

    if (!res.ok || json?.error) {
      throw new Error(json?.error || `Failed to load submission (${res.status})`);
    }

    const sub: Submission = json.submission ?? json;
    setSubmission(sub);
    setSummary(sub?.review?.summary ?? "");
    setPlaybackToken(json.playbackToken ?? null);
  }

  /** Fetch notes (GET supports videoId + token in query) */
  async function loadNotes() {
    const qs = new URLSearchParams();
    qs.set("videoId", submissionId);
    if (token) qs.set("token", token);

    const res = await fetch(`/api/svr/notes?${qs.toString()}`, {
      cache: "no-store",
    });

    const txt = await res.text();
    let json: any;
    try {
      json = JSON.parse(txt);
    } catch {
      throw new Error(`Notes response not JSON (${res.status})`);
    }

    if (!res.ok || json?.error) {
      throw new Error(json?.error || `Failed to load notes (${res.status})`);
    }

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

  /** Add a note using STRICT legacy payload and NO query token */
  async function addNoteAtCurrentTime() {
    if (!submissionId) return;

    // grab current playback time from mux-player
    const player = document.getElementById("player") as any;
    const current = Number(player?.currentTime ?? 0);
    const t = Number.isFinite(current) ? Math.floor(current) : 0;

    const body = noteText.trim();
    if (!body) return;

    try {
      setSavingNote(true);

      const payload = buildLegacyNotePayload({
        submissionId,
        coachEmail,
        t,
        body,
        token, // include in body as optional
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch(`/api/svr/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const raw = await r.text();
      let j: any = null;
      try {
        j = JSON.parse(raw);
      } catch {
        // keep raw for debugging
      }

      if (!r.ok || j?.error) {
        // surface exact server message
        console.error("POST /api/svr/notes failed:", { status: r.status, raw, json: j, payload });
        alert("Failed to save note. Check console for details.");
        return;
      }

      setNoteText("");
      await loadNotes();
    } finally {
      setSavingNote(false);
    }
  }

  /** Mark reviewed — same idea: no query token, include in header/body */
  async function markReviewedAndNotify() {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(`/api/svr/mark-reviewed`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        videoId: submissionId,
        coachEmail: coachEmail || undefined,
        reviewSummary: summary || null,
        token: token || undefined,
      }),
    });

    const raw = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(raw);
    } catch {
      // ignore
    }

    if (!r.ok || j?.error) {
      console.error("POST /api/svr/mark-reviewed failed:", { status: r.status, raw, json: j });
      alert("Failed to mark reviewed. Check console for details.");
      return;
    }

    alert("Student notified!");
  }

  /** ---------- Render ---------- */
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
      <h1 className="text-xl font-semibold mb-4">Coach Review</h1>

      <div className="grid gap-5 items-start md:grid-cols-[1.2fr_.8fr]">
        {/* Player */}
        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white">
          <div className="bg-black">
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
          </div>

          <div className="p-2 text-xs text-gray-600">{submission.title || ""}</div>

          {!readOnly && (
            <div className="p-3 border-t border-gray-100 bg-white flex gap-2">
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
        </div>

        {/* Notes + Summary */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 p-4 bg-white">
            <h3 className="font-semibold mb-2">Timestamped Notes</h3>
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

/** ---------- Utils ---------- */
function formatTime(s: number) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}
