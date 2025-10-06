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

  // Base select; join review_orders so we can filter by coach_email
  let query = supabaseAdmin
    .from('videos')
    .select(`
      id, owner_id, owner_email, owner_name, title,
      mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public,
      review_order_id,
      review_orders!inner(coach_email, coach_name, coach_id)
    `) // !inner ensures we only get rows with a linked review_order
    .order('created_at', { ascending: false });

  if (coachId) {
    // direct match on videos.coach_id
    query = query.eq('coach_id', coachId);
  } else if (coachEmail) {
    // filter via joined review_orders
    query = query.eq('review_orders.coach_email', coachEmail);
  } else if (coachRef) {
    // if you ever store coach_ref on videos
    query = query.eq('coach_ref', coachRef);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  // Optional: strip joined object from response
  const submissions = (data || []).map((row: any) => {
    const { review_orders, ...rest } = row;
    return rest;
  });

  res.status(200).json({ submissions });
  return;
});
