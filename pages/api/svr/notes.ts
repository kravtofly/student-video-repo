import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  if (req.method === 'POST') {
    const { videoId, coachId, coachEmail, t, body } = req.body || {};
    if (!videoId || typeof t !== 'number' || !body || (!coachId && !coachEmail)) {
      res.status(400).json({ error: 'Invalid payload' }); return;
    }

    // Load the video + joined review_order to verify ownership via id or email
    const { data: vid, error: vErr } = await supabaseAdmin
      .from('videos')
      .select(`
        id, coach_id, review_order_id,
        review_orders!inner(id, coach_email, coach_id)
      `)
      .eq('id', videoId)
      .single();

    if (vErr || !vid) { res.status(404).json({ error: 'Video not found' }); return; }

    const joined = (vid as any).review_orders as { coach_email?: string; coach_id?: string } | null;
    const owns =
      (coachId && vid.coach_id === coachId) ||
      (coachEmail && joined && joined.coach_email === coachEmail);

    if (!owns) { res.status(403).json({ error: 'Forbidden' }); return; }

    const insertPayload: any = {
      video_id: videoId,
      t_seconds: t,
      body: body as string,
    };
    if (coachId) insertPayload.coach_id = coachId; // nullable in schema, ok to omit if using email-only

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
