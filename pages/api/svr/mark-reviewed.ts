import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { videoId, coachId, reviewSummary } = req.body || {};
  if (!videoId || !coachId) { res.status(400).json({ error: 'videoId and coachId required' }); return; }

  const { data: vid, error: vErr } = await supabaseAdmin
    .from('videos')
    .select('id, coach_id, owner_email, owner_id, title, mux_playback_id, playback_id')
    .eq('id', videoId)
    .single();

  if (vErr || !vid) { res.status(404).json({ error: 'Video not found' }); return; }
  if (vid.coach_id !== coachId) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { data, error } = await supabaseAdmin
    .from('videos')
    .update({
      review_summary: reviewSummary ?? null,
      reviewed_at: new Date().toISOString(),
      emailed_ready: true,
      student_notified_at: new Date().toISOString(),
    })
    .eq('id', videoId)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  if (process.env.MAKE_REVIEWED_WEBHOOK_URL) {
    try {
      await fetch(process.env.MAKE_REVIEWED_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video: data }),
      });
    } catch {
      // log failure if you have logging; don't fail the request
    }
  }

  res.status(200).json({ ok: true, video: data });
  return;
});
