// app/review/upload/uploadForm.tsx
"use client";

import { useMemo, useState } from "react";

const LEVELS = ["Beginner", "Intermediate", "Advanced", "Ninja"] as const;
const KINDS = ["Tunnel", "Sky"] as const;
const DISCIPLINES = [
  "VFS","Tracking","Relative Work","Flocking","CRW","Camera Flying","BASE",
  "Angle Flying","Competition/Team Dynamics","Freestyle","Wingsuiting",
  "Canopy Piloting","Head Down","Head Up","Backflying","Freeflying",
  "Movement","Belly","Tunnel L1","Tunnel L2","Tunnel L3 Static","Tunnel L3 Dynamic",
  "Tunnel L4 Static","Tunnel L4 Dynamic","Tunnel Pro Flying",
] as const;

type Props = {
  orderId: string;
  studentEmail: string;
  studentName: string;
  coachId: string;
  coachName: string;
  defaultPublic: boolean;
};

type ItemStatus =
  | { state: "idle" }
  | { state: "creating" }
  | { state: "uploading"; sentBytes: number; totalBytes: number }
  | { state: "done" }
  | { state: "error"; message: string };

export default function UploadForm({
  orderId,
  studentEmail,
  studentName,
  coachId,
  coachName,
  defaultPublic,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [week, setWeek] = useState<number | "">("");
  const [level, setLevel] = useState<(typeof LEVELS)[number] | "">("");
  const [kind, setKind] = useState<(typeof KINDS)[number] | "">("");
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [ownerName, setOwnerName] = useState<string>(studentName || "");
  const [status, setStatus] = useState<Record<string, ItemStatus>>({});
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () =>
      files.length > 0 &&
      !!studentEmail &&
      !!coachId &&
      (week === "" || (typeof week === "number" && week > 0)),
    [files, studentEmail, coachId, week]
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    setFiles(Array.from(list));
    // prime status map
    const next: Record<string, ItemStatus> = {};
    Array.from(list).forEach((f) => (next[f.name] = { state: "idle" }));
    setStatus(next);
  }

  function toggleDiscipline(d: string) {
    setDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  async function doUploadOne(file: File) {
    const name = file.name;
    setStatus((s) => ({ ...s, [name]: { state: "creating" } }));

    // 1) Get Mux direct upload URL for this file with metadata
    const res = await fetch("/api/create-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        ownerEmail: studentEmail,
        ownerName,
        coachId,
        weekNumber: typeof week === "number" ? week : undefined,
        level: level || undefined,
        kind: kind || undefined,
        disciplines,
        reviewOrderId: orderId,
      }),
    });

    if (!res.ok) {
      const msg = `create-upload failed (${res.status})`;
      setStatus((s) => ({ ...s, [name]: { state: "error", message: msg } }));
      return;
    }

    const { uploadUrl } = (await res.json()) as { uploadUrl: string };
    if (!uploadUrl) {
      setStatus((s) => ({
        ...s,
        [name]: { state: "error", message: "no uploadUrl returned" },
      }));
      return;
    }

    // 2) PUT the bytes to the upload URL
    setStatus((s) => ({
      ...s,
      [name]: { state: "uploading", sentBytes: 0, totalBytes: file.size },
    }));

    // Use fetch PUT (no fancy progress; we’ll guesstimate “sent” after it finishes)
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!putRes.ok) {
      const msg = `upload PUT failed (${putRes.status})`;
      setStatus((s) => ({ ...s, [name]: { state: "error", message: msg } }));
      return;
    }

    setStatus((s) => ({ ...s, [name]: { state: "done" } }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Upload sequentially (simpler UX + avoids rate/size spikes)
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        await doUploadOne(f);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border p-4">
        <div className="mb-2 text-sm text-gray-600">
          You are uploading as <span className="font-medium">{studentEmail}</span>{" "}
          to coach <span className="font-medium">{coachName || coachId}</span>.
        </div>

        <label className="mb-2 block text-sm font-medium">Select files</label>
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={onFileChange}
          className="block w-full rounded-lg border p-2"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Student name</label>
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Week (optional)</label>
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) =>
              setWeek(e.target.value ? Number(e.target.value) : "")
            }
            className="w-full rounded-lg border px-3 py-2"
            placeholder="e.g., 1"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Skill level</label>
          <select
            value={level}
            onChange={(e) => setLevel((e.target.value as any) || "")}
            className="w-full rounded-lg border px-3 py-2"
          >
            <option value="">Select…</option>
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Type</label>
          <select
            value={kind}
            onChange={(e) => setKind((e.target.value as any) || "")}
            className="w-full rounded-lg border px-3 py-2"
          >
            <option value="">Select…</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Disciplines</label>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {DISCIPLINES.map((d) => {
            const checked = disciplines.includes(d);
            return (
              <label
                key={d}
                className={`flex items-center gap-2 rounded-lg border p-2 ${
                  checked ? "bg-gray-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDiscipline(d)}
                />
                <span className="text-sm">{d}</span>
              </label>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-40"
      >
        {submitting ? "Uploading…" : "Start upload"}
      </button>

      {/* Status list */}
      {files.length > 0 && (
        <div className="rounded-xl border p-3">
          <h3 className="mb-2 font-medium">Upload status</h3>
          <ul className="space-y-1 text-sm">
            {files.map((f) => {
              const st = status[f.name]?.state || "idle";
              return (
                <li key={f.name} className="flex items-center justify-between">
                  <span className="truncate">{f.name}</span>
                  <span
                    className={
                      st === "done"
                        ? "text-green-600"
                        : st === "error"
                        ? "text-red-600"
                        : "text-gray-600"
                    }
                  >
                    {st}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            After upload finishes, we’ll process your videos. You’ll receive feedback
            from your coach. If you scheduled a 1:1, make sure it’s at least 48h after
            upload so the coach can review first.
          </p>
        </div>
      )}
    </form>
  );
}
