import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET: list notes for a video
  if (req.method === 'GET') {
    const videoId = req.query.videoId as string;
    if (!videoId) { res.status(400).json({ error: 'videoId required' }); return; }

    const { data, error } = await supabaseAdmin
      .from('review_comments')
      .select('id, video_id, coach_id, t_seconds, body, created_at')
      .eq('video_id', videoId)
      .order('t_seconds', { ascending: true });

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ notes: data ?? [] });
    return;
  }

  // POST: add a note (accepts coachId OR coachEmail)
  if (req.method === 'POST') {
    const { videoId, coachId, coachEmail, t, body } = req.body || {};

    if (!videoId || typeof t !== 'number' || !body || (!coachId && !coachEmail)) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    // Verify ownership: the requester must be the assigned coach (by id or email)
    const { data: vid, error: vErr } = await supabaseAdmin
      .from('videos')
      .select('id, coach_id, coach_email')
      .eq('id', videoId)
      .single();

    if (vErr || !vid) { res.status(404).json({ error: 'Video not found' }); return; }

    const owns =
      (coachId && vid.coach_id === coachId) ||
      (coachEmail && vid.coach_email === coachEmail);

    if (!owns) { res.status(403).json({ error: 'Forbidden' }); return; }

    // Prepare insert payload. coach_id can be null in your schema, so if only email is provided we leave coach_id null.
    const insertPayload: any = {
      video_id: videoId,
      t_seconds: t,
      body: body as string,
    };
    if (coachId) insertPayload.coach_id = coachId;

    const { data, error } = await supabaseAdmin
      .from('review_comments')
      .insert(insertPayload)
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ note: data });
    return;
  }

  res.status(405).end();
  return;
});
