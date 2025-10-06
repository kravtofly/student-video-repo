import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const coachId = (req.query.coachId as string) || '';
  const coachEmail = (req.query.coachEmail as string) || '';
  const coachRef = (req.query.coachRef as string) || '';

  if (!coachId && !coachEmail && !coachRef) {
    res.status(400).json({ error: 'Provide coachId OR coachEmail OR coachRef' }); return;
  }

  let query = supabaseAdmin
    .from('videos')
    .select(
      'id, owner_id, owner_email, owner_name, title, mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public'
    )
    .order('created_at', { ascending: false });

  if (coachId) query = query.eq('coach_id', coachId);
  else if (coachEmail) query = query.eq('coach_email', coachEmail);
  else if (coachRef) query = query.eq('coach_ref', coachRef);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  res.status(200).json({ submissions: data ?? [] });
  return;
});
