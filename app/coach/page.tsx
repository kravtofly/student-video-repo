// app/coach/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const revalidate = 60; // refresh list every 60s (ISR)

export default async function CoachPage() {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id, title, playback_id, asset_id, owner_id, created_at")
    .not("asset_id", "is", null) // "ready" rows (works with your RLS)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Latest Videos</h1>
        <div className="text-red-600">Error loading videos: {error.message}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Latest Videos</h1>
      <VideoGrid videos={data ?? []} />
    </main>
  );
}

// Import the client component from a sibling file
import VideoGrid from "./video-grid";
