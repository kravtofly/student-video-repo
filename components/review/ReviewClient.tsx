"use client";

import React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "mux-player": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        "stream-type"?: string;
        "playback-id"?: string;
        "playback-token"?: string;
        controls?: boolean;
        playsinline?: boolean;
        "primary-color"?: string;
        "secondary-color"?: string;
      };
    }
  }
}


type ViewerRole = "coach" | "student";

interface Submission {
  id: string;
  title?: string;
  owner_email?: string;
  owner_name?: string;
  mux_asset_id?: string;
  mux_playback_id?: string;   // common
  playback_id?: string;       // alt naming
  muxPlaybackId?: string;     // alt naming
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
  const [playbackId, setPlaybackId] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  const qs = token ? `?token=${encodeURIComponent(token)}` : "";

  // Load mux-player web component (works great with HLS on Chrome)
  React.useEffect(() => {
    // don’t re-add if already present
    if (document.querySelector('script[data-mux-player]')) return;
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@mux/mux-player";
    s.defer = true;
    s.setAttribute("data-mux-player", "1");
    document.head.appendChild(s);
  }, []);

  function getPlaybackFrom(sub: Submission | null | undefined) {
    return (
      sub?.mux_playback_id ||
      (sub as any)?.playback_id ||
      (sub as any)?.muxPlaybackId ||
      ""
    );
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);

      // 1) Submission (server returns full record)
      const subRes = await fetch(
        `/api/svr/submission/${encodeURIComponent(submissionId)}${qs}`,
        { cache: "no-store" }
      );
      if (!subRes.ok) throw new Error(`Failed to load submission (${subRes.status})`);
      const subJson = await subRes.json();
      const sub: Submission = subJson?.submission ?? subJson;
      setSubmission(sub);
      setSummary(sub?.review?.summary ?? "");

      // Resolve playback id from submission
      const pb = getPlaybackFrom(sub);
      setPlaybackId(pb);

      // 2) Notes (expects query key: videoId)
      const notesRes = await fetch(
        `/api/svr/notes?videoId=${encodeURIComponent(submissionId)}${qs}`,
        { cache: "no-store" }
      );
      if (!notesRes.ok) throw new Error(`Failed to load notes (${notesRes.status})`);
      const notesJson = await notesRes.json();
      setNotes(notesJson?.notes ?? notesJson ?? []);

      // 3) Mux playback (sign for *playback id*, not submission id)
      if (!pb) {
        throw new Error("This submission has no Mux playbackId.");
      }
      const muxRes = await fetch(
        `/api/mux/playback/${encodeURIComponent(pb)}${qs}`,
        { cache: "no-store" }
      );
      if (!muxRes.ok) throw new Error(`Failed to load playback token (${muxRes.status})`);
      const muxJson: any = await muxRes.json();

      // Accept various shapes from your API
      const src: string =
        muxJson?.signedUrl ||
        muxJson?.hls ||
        muxJson?.url ||
        muxJson?.src ||
        ""; // final fallback below if empty

      setVideoSrc(src || `https://stream.mux.com/${pb}.m3u8`);
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

  // -------- Coach actions --------
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

  // -------- Render --------
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-gray-600">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
        {error}
      </div>
    );
  }
  if (!submission) {
    return <div className="p-6">Submission not found.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 grid md:grid-cols-5 gap-6">
      {/* Left: Player + coach toolbar */}
      <div className="md:col-span-3 space-y-4">
        <div className="rounded-2xl overflow-hidden shadow border border-gray-200 bg-black">
  {videoSrc ? (
    <mux-player
      /* layout */
      style={{ aspectRatio: "16 / 9", width: "100%", height: "auto" }}
      /* playback */
      src={videoSrc}
      controls
      playsinline
      /* cosmetics */
      primary-color="#111111"
      secondary-color="#999999"
      stream-type="on-demand"
      {...(playbackId ? { "playback-id": playbackId } : {})}
    />
  ) : (
    <div className="p-8 text-white text-center">No video source available.</div>
  )}
</div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <AddNoteForm onAdd={addNote} />
            <button
              onClick={markReviewedAndNotify}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
            >
              Mark Reviewed &amp; Notify Student
            </button>
          </div>
        )}
      </div>

      {/* Right: Notes + Summary */}
      <div className="md:col-span-2 space-y-6">
        <section className="rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Timestamped Notes</h2>
          <p className="text-sm text-gray-500 mt-1">
            Click a note to jump the video to that moment.
          </p>
          <ul className="mt-3 space-y-2">
            {notes.length === 0 && (
              <li className="text-gray-500">No notes yet.</li>
            )}
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  className="w-full text-left px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50"
                  onClick={() => {
                    const ev = document.querySelector("mux-player") as any;
                    if (ev && typeof ev.currentTime === "number") {
                      ev.currentTime = n.at;
                      ev.play?.();
                    }
                  }}
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

        <section className="rounded-2xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold">Coach’s Summary</h2>
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
}: {
  onAdd: (atSeconds: number, text: string) => Promise<void>;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function handleAdd() {
    const clean = text.trim();
    if (!clean) return;

    // Read current time from mux-player web component
    const player = document.querySelector("mux-player") as any;
    const at = Math.floor((player?.currentTime as number) ?? 0);

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
