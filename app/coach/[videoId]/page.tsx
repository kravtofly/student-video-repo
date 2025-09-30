// Server component
import { supabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export default async function CoachVideoPage({
  params,
}: { params: { videoId: string } }) {
  const { data: video, error } = await supabaseAdmin
    .from("videos")
    .select("id, mux_playback_id, owner_name, discipline, description")
    .eq("id", params.videoId)
    .single();

  if (error || !video) {
    return <div style={{ padding: 24 }}>Video not found.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold mb-2">Coach Review</h1>
      <p className="text-sm text-gray-600 mb-4">
        {video.owner_name ? `${video.owner_name} • ` : ""}
        {video.discipline || "—"} — {video.description || "No description"}
      </p>
      {/* @ts-expect-error Server-to-Client boundary */}
      <CoachReviewClient
        videoId={video.id}
        playbackId={video.mux_playback_id}
      />
    </div>
  );
}

// Lazy import client component to keep this file small
import CoachReviewClient from "./CoachReviewClient";
