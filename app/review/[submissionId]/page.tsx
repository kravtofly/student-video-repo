// =============================================================
// File: app/review/[submissionId]/page.tsx
// Purpose: Canonical review route that serves BOTH coach (editable)
// and student (read‑only) experiences.
// Notes: - Looks like pages/review.tsx
// - Has coach tools from app/coach/[videoId]/page.tsx
// - Switches UI via `readOnly` derived from access method
// =============================================================


import { headers } from "next/headers";
import type { Metadata } from "next";
import ReviewClient from "@/components/review/ReviewClient";


export const metadata: Metadata = {
title: "Krāv – Video Review",
};


function getBaseUrl() {
// Works on both server and edge runtimes
const h = headers();
const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
return `${proto}://${host}`;
}


async function resolveAccess({ submissionId, token }: { submissionId: string; token?: string | null }) {
// Minimal access resolver:
// - If a valid magic-link token is present for this submission → student (readOnly)
// - Else assume authenticated coach (editable)
// You can harden this with your actual auth/session checks.
const base = getBaseUrl();


if (token) {
try {
const r = await fetch(`${base}/api/svr/verify-token?submissionId=${encodeURIComponent(submissionId)}&token=${encodeURIComponent(token)}`, { cache: "no-store" });
const ok = r.ok ? await r.json() : { ok: false };
if (ok?.ok) return { role: "student" as const, readOnly: true };
} catch {}
}
// Default to coach mode (editable) when there's no valid token.
return { role: "coach" as const, readOnly: false };
}


export default async function Page({ params, searchParams }: { params: { submissionId: string }; searchParams: Record<string, string | string[] | undefined> }) {
const submissionId = params.submissionId;
const token = (searchParams?.token as string | undefined) ?? null;


const access = await resolveAccess({ submissionId, token });


// (Optional) Preload a tiny bit of data server-side for faster TTFB
// but keep the client in charge of fetching full submission/notes.
return (
<ReviewClient
submissionId={submissionId}
token={token}
readOnly={access.readOnly}
viewerRole={access.role}
/>
);
}
