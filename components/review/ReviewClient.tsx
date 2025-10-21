// =============================================================
<p className="text-sm text-gray-500 mt-1">Click a note to jump the video to that moment.</p>
<ul className="mt-3 space-y-2">
{notes.length === 0 && <li className="text-gray-500">No notes yet.</li>}
{notes.map((n) => (
<li key={n.id}>
<button
className="w-full text-left px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50"
onClick={() => handleNoteClick(n)}
>
<span className="font-mono text-xs mr-2 bg-gray-100 px-2 py-0.5 rounded">{formatTime(n.at)}</span>
<span className="align-middle">{n.text}</span>
</button>
</li>
))}
</ul>
</section>


<section>
<h2 className="text-lg font-semibold">Coach’s Summary</h2>
<p className="text-sm text-gray-500 mt-1">High‑level takeaways and next steps.</p>
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


// --- Small components ----------------------------------------
function AddNoteForm({ onAdd, videoRef }: { onAdd: (atSeconds: number, text: string) => Promise<void>; videoRef: React.MutableRefObject<HTMLVideoElement | null>; }) {
const [text, setText] = React.useState("");
const [busy, setBusy] = React.useState(false);


async function handleAdd() {
if (!text.trim()) return;
const at = Math.floor(videoRef.current?.currentTime ?? 0);
try {
setBusy(true);
await onAdd(at, text.trim());
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


// --- Utils ----------------------------------------------------
function formatTime(totalSeconds: number) {
const s = Math.max(0, Math.floor(totalSeconds));
const m = Math.floor(s / 60);
const r = s % 60;
return `${m}:${r.toString().padStart(2, "0")}`;
}
