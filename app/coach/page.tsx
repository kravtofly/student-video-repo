import ClientMuxPlayer from "./ClientMuxPlayer";
import { supabaseAdmin } from "@/lib/supabase";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string | null;
  filename: string | null;
  playback_id: string | null;
  created_at: string;
  duration: number | null;
  owner_id: string | null;
  status: string | null;
};

function signToken(playbackId: string, ttlSec = 3600) {
  return jwt.sign(
    { sub: playbackId, aud: "v" },
    process.env.MUX_SIGNING_KEY_SECRET!,
    { algorithm: "HS256", expiresIn: ttlSec, header: { kid: process.env.MUX_SIGNING_KEY_ID! } }
  );
}

export default async function CoachPage() {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id,title,filename,playback_id,created_at,duration,owner_id,status")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return <div style={{ padding: 24 }}>DB error: {error.message}</div>;
  }

  const items = (data || []).filter(v => v.playback_id) as (Row & { playback_id: string })[];

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Coach Review</h1>
      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        {items.length ? `Showing ${items.length} latest ready videos` : "No ready videos yet."}
      </p>

      {items.map(v => {
        const token = signToken(v.playback_id);
        const label = v.title || v.filename || v.id.slice(0, 8);
        return (
          <section key={v.id} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{label}</h2>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              {new Date(v.created_at).toLocaleString()} • {v.duration ? `${v.duration.toFixed(1)}s` : "—"}
            </div>
            <ClientMuxPlayer playbackId={v.playback_id} token={token} />
          </section>
        );
      })}
    </main>
  );
}
