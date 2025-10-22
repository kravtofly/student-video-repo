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
  t_seconds: number;
  body: string;
  created_at: string;
};

// TS-friendly alias for the mux-player web component
const MuxPlayer = "mux-player" as any;

/** ---------- Helpers ---------- */
const LS_TOKEN_KEY = (id: string) => `coachToken:${id}`;

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
    t,
    body,

    // legacy aliases
    at: t,
    text: body,

    // some handlers read token from body
    token: token || undefined,
  };
}

function getQS(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

/** =========================================================
 * ReviewClient
 * ========================================================= */
export default function ReviewClient({
  submissionId,
  token: tokenFromProps,
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

  const [apiToken, setApiToken] = React.useState<string | null>(null); // ← token used for notes API

  const [notes, setNotes] = React.useState<Note[]>([]);
  const [summary, setSummary] = React.useState<string>("");

  // Inline "add note" UI
  const [noteText, setNoteText] = React.useState("");
  const [savingNote, setSavingNote] = React.useState(false);

  // coachEmail can be provided by dashboard link
  const coachEmail = React.useMemo(() => getQS("coachEmail"), []);

  // mux-player loader
  React.useEffect(() => {
    if (document.querySelector('script[data-mux-player]')) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@mux/mux-player";
    s.defer = true;
    s.setAttribute("data-mux-player", "1");
    document.head.appendChild(s);
  }, []);

  function getPlaybackId(sub: Submission | null | undefined) {
    return (sub?.mux_playback_id || sub?.playback_id || "") as string;
  }

  /** Discover an API token (URL → localStorage → submission endpoint → fallback) */
  async function resolveApiToken(): Promise<string | null> {
    // 1) URL (?token=...)
    const qsToken = getQS("token");
    if (qsToken) {
      try { localStorage.setItem(LS_TOKEN_KEY(submissionId), qsToken); } catch {}
      return qsToken;
    }

    // 2) localStorage
    try {
      const cached = localStorage.getItem(LS_TOKEN_KEY(submissionId));
      if (cached) return cached;
    } catch {}

    // 3) submission endpoint often returns some token variants
    try {
      const subRes = await fetch(
        `/api/svr/submission/${encodeURIComponent(submissionId)}` +
          (coachEmail ? `?coachEmail=${encodeURIComponent(coachEmail)}` : ""),
        { cache: "no-store" }
      );
      const j = await subRes.json();
      const discovered: string | null =
        j?.token ||
        j?.apiToken ||
        j?.reviewToken ||
        j?.notesToken ||
        null;
      if (discovered) {
        try { localStorage.setItem(LS_TOKEN_KEY(submissionId), discovered); } catch {}
        return discovered;
      }
    } catch { /* silent */ }

    // 4) OPTIONAL: some stacks expose an apiToken from a playback endpoint
    try {
      const muxRes = await fetch(`/api/mux/playback/${encodeURIComponent(submissionId)}`, { cache: "no-store" });
      if (muxRes.ok) {
        const j = await muxRes.json();
        const discovered = j?.apiToken || j?.token || null;
        if (discovered) {
          try { localStorage.setItem(LS_TOKEN_KEY(submissionId), discovered); } catch {}
          return discovered;
        }
      }
    } catch { /* silent */ }

    return null;
  }

  /** Load submission (and playback token if present) */
  async function loadSubmission() {
    const res = await fetch(
      `/api/svr/submission/${encodeURIComponent(submissionId)}` +
        (coachEmail ? `?coachEmail=${encodeURIComponent(coachEmail)}` : ""),
      { cache: "no-store" }
    );
    const json = await res.json();
    if (!res.ok || json?.error) {
      throw new Error(json?.error || `Failed to load submission (${res.status})`);
    }
    const sub: Submission = json.submission ?? json;
    setSubmission(sub);
    setSummary(sub?.review?.summary ?? "");
    setPlaybackToken(json.playbackToken ?? json.muxPlaybackToken ?? null);
  }

  /** Load notes with token */
  async function loadNotes(withToken: string | null) {
    const tokenQS = withToken ? `&token=${encodeURIComponent(withToken)}` : "";
    const res = await fetch(
      `/api/svr/notes?videoId=${encodeURIComponent(submissionId)}${tokenQS}`,
      { cache: "no-store" }
    );
    const json = await res.json();
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

        await loadSubmission();

        // Determine best token (props, URL/localStorage, then discovery)
        const discovered =
          tokenFromProps ||
          (await resolveApiToken());

        setApiToken(discovered);

        // persist whatever we discovered
        if (discovered) {
          try { localStorage.setItem(LS_TOKEN_KEY(submissionId), discovered); } catch {}
        }

        await loadNotes(discovered || null);
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  /** Add note at current time (coach) */
  async function addNoteAtCurrentTime() {
    const player = document.getElementById("player") as any;
    const t = Math.floor((player?.currentTime || 0) as number);
    const body = noteText.trim();
    if (!body) return;

    try {
      setSavingNote(true);

      // Make sure we have a token right now
      let token = apiToken;
      if (!token) {
        token = await resolveApiToken();
        if (token) {
          setApiToken(token);
          try { localStorage.setItem(LS_TOKEN_KEY(submissionId), token); } catch {}
        }
      }
      if (!token) {
        console.error("No API token available for notes POST.");
        alert("Failed to save note. Missing token.");
        return;
      }

      const payload = buildNotePayload({
        submissionId,
        coachEmail,
        t,
        body,
        token,
      });

      const r = await fetch(`/api/svr/notes?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const raw = await r.text();
      let j: any = {};
      try { j = JSON.parse(raw); } catch {}

      if (!r.ok || j?.error) {
        console.error("POST /api/svr/notes failed:", { status: r.status, json: j, payload, raw });
        alert(j?.error || "Failed to save note. Check console for details.");
        return;
      }

      setNoteText("");
      await loadNotes(token);
    } finally {
      setSavingNote(false);
    }
  }

  /** Mark reviewed (coach) */
  async function markReviewedAndNotify() {
    // use the same apiToken if present
    const token = apiToken || (await resolveApiToken());
    const r = await fetch(
      `/api/svr/mark-reviewed${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          videoId: submissionId,
          coachEmail: coachEmail || undefined,
          reviewSummary: summary || null,
          token: token || undefined, // legacy handlers
        }),
      }
    );
    const j = await r.json();
    if (!r.ok || j?.error) {
      console.error("POST /api/svr/mark-reviewed failed:", j);
      alert(j?.error || "Failed to mark reviewed");
      return;
    }
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
    <main className="mx-auto max-w-[1100px] p-4 md:p-6 font-[system-ui,-apple-system,Segoe UI,Roboto,Arial]">
      <h1 className="text-xl font-semibold mb-4">Coach Review</h1>

      <div className="grid gap-5 items-start md:grid-cols-[1.2fr_.8fr]">
        {/* Player Card */}
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

        {/* Right column: Notes + Summary */}
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
