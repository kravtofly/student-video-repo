// pages/api/student/review/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';

// (Optional) narrow CORS to your domain
function setCORS(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://www.kravtofly.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const videoId = req.query.id as string;
  if (!videoId) return res.status(400).json({ error: 'Missing id' });

  // (Light auth) require a magic-link token header to avoid anonymous scraping.
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  // NOTE: if you verify the token elsewhere, keep that logic. This endpoint only checks presence.

  // 1) Load video metadata
  const { data: vid, error: vErr } = await supabaseAdmin
    .from('videos')
    .select('id, title, mux_playback_id, playback_id, review_summary')
    .eq('id', videoId)
    .maybeSingle();

  if (vErr) return res.status(500).json({ error: vErr.message });
  if (!vid) return res.status(404).json({ error: 'Not found' });

  // 2) Load notes from your actual columns t_seconds/body and normalize
  const { data: rawNotes, error: notesErr } = await supabaseAdmin
    .from('review_comments')
    .select('t_seconds, body')
    .eq('video_id', videoId)
    .order('t_seconds', { ascending: true });

  if (notesErr) return res.status(500).json({ error: notesErr.message });

  const notes = (rawNotes || []).map((n: any) => ({
    t: Number(n.t_seconds ?? 0),
    text: String(n.body ?? '').trim(),
  }));

  // 3) Respond
  res.status(200).json({
    video: {
      id: vid.id,
      title: vid.title,
      playbackId: vid.mux_playback_id ?? vid.playback_id ?? null,
      summary: vid.review_summary ?? null,
    },
    notes,
  });
}
