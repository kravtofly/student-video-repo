import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { videoId, coachId, coachEmail, reviewSummary } = req.body || {};
  if (!videoId || (!coachId && !coachEmail)) {
    res.status(400).json({ error: 'videoId and coach identity required' });
    return;
  }

  // Confirm the coach owns this video (by id or email)
  const { data: vid, error: vErr } = await supabaseAdmin
    .from('videos')
    .select('id, coach_id, coach_email, owner_email, owner_id, title, mux_playback_id, playback_id')
    .eq('id', videoId)
    .single();

  if (vErr || !vid) { res.status(404).json({ error: 'Video not found' }); return; }

  const owns =
    (coachId && vid.coach_id === coachId) ||
    (coachEmail && vid.coach_email === coachEmail);

  if (!owns) { res.status(403).json({ error: 'Forbidden' }); return; }

  // Update review fields and stamp notification (inline)
  const { data, error } = await supabaseAdmin
    .from('videos')
    .update({
      review_summary: reviewSummary ?? null,
      reviewed_at: new Date().toISOString(),
      emailed_ready: true,               // legacy flag you already had
      student_notified_at: new Date().toISOString(),
    })
    .eq('id', videoId)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Optional: Notify Make to send the email (if you prefer Make to handle it)
  if (process.env.MAKE_REVIEWED_WEBHOOK_URL) {
    try {
      await fetch(process.env.MAKE_REVIEWED_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video: data }),
      });
    } catch {
      // swallow (or log) to avoid failing the API response due to Make being down
    }
  }

  res.status(200).json({ ok: true, video: data });
  return;
});
