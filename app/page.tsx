// app/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import VideoGrid from "./coach/video-grid"; // <-- point to the file we created

export const revalidate = 60;

export default async function Home() {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id, title, playback_id, asset_id, owner_id, created_at, status")
    .eq("status", "ready") // only show playable videos
    .order("created_at", { ascending: false })
    .limit(8);

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Latest Videos</h1>
        <a href="/coach" className="text-sm text-blue-600 hover:underline">
          View all →
        </a>
      </div>
      <VideoGrid videos={data ?? []} />
    </main>
  );
}
