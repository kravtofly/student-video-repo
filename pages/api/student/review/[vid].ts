// pages/api/student/review/[vid].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  // Accept either ?vid or ?id based on filename/usage
  const rawVideoId =
    (req.query.vid as string) ||
    (req.query.id as string) ||
    '';

  if (!rawVideoId) { res.status(400).json({ error: 'Missing video id' }); return; }

  // Defensive: strip any query params that might be incorrectly attached
  const videoId = rawVideoId.split('?')[0].trim();

  // (Optional) If you want to require a magic-link token header, uncomment:
  // const auth = req.headers.authorization || '';
  // if (!auth.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }

  // 1) Load video metadata
  const { data: vid, error: vErr } = await supabaseAdmin
    .from('videos')
    .select('id, title, mux_playback_id, playback_id, review_summary')
    .eq('id', videoId)
    .maybeSingle();

  if (vErr) { res.status(500).json({ error: vErr.message }); return; }
  if (!vid) { res.status(404).json({ error: 'Not found' }); return; }

  // 2) Load notes using your actual columns: t_seconds (numeric) and body (text)
  const { data: rawNotes, error: nErr } = await supabaseAdmin
    .from('review_comments')
    .select('t_seconds, body')
    .eq('video_id', videoId)
    .order('t_seconds', { ascending: true });

  if (nErr) { res.status(500).json({ error: nErr.message }); return; }

  // 3) Normalize to { t, text } for the Webflow embed
  const notes = (rawNotes || []).map((n: any) => ({
    t: Number(n.t_seconds ?? 0),
    text: String(n.body ?? '').trim(),
  }));

  // 4) Respond
  res.status(200).json({
    video: {
      id: vid.id,
      title: vid.title,
      playbackId: vid.mux_playback_id ?? vid.playback_id ?? null,
      summary: vid.review_summary ?? null,
    },
    notes,
  });
});
