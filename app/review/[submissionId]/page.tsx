import { headers } from "next/headers";
import type { Metadata } from "next";
import ReviewClient from "@/components/review/ReviewClient";

export const metadata: Metadata = {
  title: "Krāv – Video Review",
};

function getBaseUrl() {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function resolveAccess({
  submissionId,
  token,
}: {
  submissionId: string;
  token?: string | null;
}) {
  const base = getBaseUrl();
  if (token) {
    try {
      const r = await fetch(
        `${base}/api/svr/verify-token?submissionId=${encodeURIComponent(
          submissionId
        )}&token=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      );
      const ok = r.ok ? await r.json() : { ok: false };
      if (ok?.ok) return { role: "student" as const, readOnly: true };
    } catch {
      // fall through to coach
    }
  }
  return { role: "coach" as const, readOnly: false };
}

export default async function Page(props: {
  params: { submissionId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const submissionId = props.params.submissionId;
  const token =
    (props.searchParams?.token as string | undefined) ?? null;

  const access = await resolveAccess({ submissionId, token });

  return (
    <ReviewClient
      submissionId={submissionId}
      token={token}
      readOnly={access.readOnly}
      viewerRole={access.role}
    />
  );
}
