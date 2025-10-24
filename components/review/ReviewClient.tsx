"use client";

import React from "react";

/** ---------- Types that match your current API ---------- */
type ViewerRole = "coach" | "student";

type Submission = {
  id: string;
  title?: string | null;
  mux_playback_id?: string | null; // primary
  playback_id?: string | null;     // legacy alias
  owner_name?: string | null;
  review?: { summary?: string | null } | null;
};

type Note = {
  id: string;
  t_seconds: number; // server returns canonical seconds here
  body: string;
  created_at: string;
};

// TS-friendly alias for the mux-player web component
const MuxPlayer = "mux-player" as any;

/** ---------- Helper: note payload that satisfies old & new handlers ---------- */
function buildNotePayload(args: {
  submissionId: string;
  coachEmail?: string | null;
  t: number;
  body: string;
  token?: string | null;
}) {
  const { submissionId, coachEmail, t, body, token } = args;
  return {
    // current shape
    videoId: submissionId,
    coachEmail: coachEmail || undefined,
    t,          // seconds
    body,       // note text
    token: token || undefined,

    // legacy aliases (some older endpoints looked for these)
    at: t,
    text: body,
  };
}

/** =========================================================
 * ReviewClient
 *  - If no token is provided in the URL, it will fetch one using
 *    /api/svr/review-token?videoId=...&coachEmail=...
 *  - Loads submission, notes, and mux playback token
 *  - Saves notes with the token
 * ========================================================= */
export default function ReviewClient({
  submissionId,
  token: initialToken,
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

  // Inline "add note" UI
  const [noteText, setNoteText] = React.useState("");
  const [savingNote, setSavingNote] = React.useState(false);

  // effective token we will use (from URL or fetched)
  const [apiToken, setApiToken] = React.useState<string | null>(initialToken);

  // Read coachEmail from the querystring (Webflow dashboard links provide it)
  const coachEmail = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    const qs = new URLSearchParams(window.location.search);
    return qs.get("coachEmail") || "";
  }, []);

  /** small helper to build ?token= suffix for GETs */
  const qsToken = apiToken ? `?token=${encodeURIComponent(apiToken)}` : "";

  /** Load mux-player script once */
  React.useEffect(() => {
    if (document.querySelector('script[data-mux-player]')) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@mux/mux-player";
    s.defer = true;
    s.setAttribute("data-mux-player", "1");
    document.head.appendChild(s);
  }, []);

  /** Resolve playbackId from either field name */
  function getPlaybackId(sub: Submission | null | undefined) {
    return (sub?.mux_playback_id || sub?.playback_id || "") as string;
  }

  /** If we don’t have a token (dashboard link), try to mint one. */
  async function ensureToken(): Promise<string | null> {
    if (apiToken) return apiToken;

    // Need coachEmail to mint a review token for this coach
    if (!coachEmail) return null;

    try {
      const r = await fetch(
        `/api/svr/review-token?videoId=${encodeURIComponent(
          submissionId
        )}&coachEmail=${encodeURIComponent(coachEmail)}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (!r.ok || j?.error) {
        console.warn("Failed to mint review token:", j?.error || r.status);
        return null;
      }
      const t = j?.token || null;
      setApiToken(t);
      return t;
    } catch (e) {
      console.warn("Failed to mint review token:", e);
      return null;
    }
  }

  /** Fetch submission + playbackToken (the legacy route returns both) */
  async function loadSubmissionAndPlaybackToken() {
    const res = await fetch(
      `/api/svr/submission/${encodeURIComponent(submissionId)}${qsToken}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    if (!res.ok || json?.error) {
      throw new Error(json?.error || `Failed to load submission (${res.status})`);
    }
    const sub: Submission = json.submission ?? json;
    setSubmission(sub);
    setSummary(sub?.review?.summary ?? "");
    setPlaybackToken(json.playbackToken ?? null); // signed playback token for <mux-player>
  }

  /** Fetch notes */
  async function loadNotes() {
    const tokenParam = apiToken ? `&token=${encodeURIComponent(apiToken)}` : "";
    const res = await fetch(
      `/api/svr/notes?videoId=${encodeURIComponent(submissionId)}${tokenParam}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    if (json?.error) throw new Error(json.error);
    setNotes(json.notes || []);
  }

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) If the URL didn’t give us a token, try to mint one (dashboard case)
        if (!initialToken) {
          await ensureToken();
        }

        // 2) Load submission (and playback token) + notes
        await loadSubmissionAndPlaybackToken();
        await loadNotes();
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, initialToken, coachEmail]);

  /** Add note at current time (coach) */
  async function addNoteAtCurrentTime() {
    if (!submissionId) return;

    // must have an API token to save notes
    const effectiveToken = apiToken || (await ensureToken());
    if (!effectiveToken) {
      alert("Failed to save note. Missing token.");
      return;
    }

    const player = document.getElementById("player") as any;
    const t = Math.floor((player?.currentTime || 0) as number);
    const body = noteText.trim();
    if (!body) return;

    try {
      setSavingNote(true);
      const payload = buildNotePayload({
        submissionId,
        coachEmail,
        t,
        body,
        token: effectiveToken,
      });

      const r = await fetch(`/api/svr/notes?token=${encodeURIComponent(effectiveToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "Failed to save note");
      setNoteText("");
      await loadNotes();
    } catch (e: any) {
      console.error("POST /api/svr/notes failed:", e);
      alert(e?.message || "Failed to save note. Check console for details.");
    } finally {
      setSavingNote(false);
    }
  }

  /** Mark reviewed (coach) */
  async function markReviewedAndNotify() {
    const effectiveToken = apiToken || (await ensureToken());
    if (!effectiveToken) {
      alert("Missing token.");
      return;
    }

    const r = await fetch(`/api/svr/mark-reviewed?token=${encodeURIComponent(effectiveToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: submissionId,
        coachEmail: coachEmail || undefined,
        reviewSummary: summary || null,
        token: effectiveToken,
      }),
    });
    const j = await r.json();
    if (!r.ok || j?.error) throw new Error(j?.error || "Failed to mark reviewed");
    alert("Student notified!");
  }

  /** Render states */
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
    <main className="mx-auto max-w-[1100px] p-4 md:p-6 font-[system-ui,-apple-system,Segoe_UI,Roboto,Arial]">
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
