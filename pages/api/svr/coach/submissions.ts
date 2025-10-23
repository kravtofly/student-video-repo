import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const coachId = (req.query.coachId as string) || '';
  const coachEmail = (req.query.coachEmail as string) || '';
  const coachRef = (req.query.coachRef as string) || '';

  if (!coachId && !coachEmail && !coachRef) {
    res.status(400).json({ error: 'Provide coachId OR coachEmail OR coachRef' }); return;
  }

  // Case 1: direct by videos.coach_id
  if (coachId) {
    const { data, error } = await supabaseAdmin
      .from('videos')
      .select('id, owner_id, owner_email, owner_name, title, mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ submissions: data ?? [] }); return;
  }

  // Case 2: by coachEmail via review_orders
  if (coachEmail) {
    // get all order ids for this coachEmail
    const { data: orders, error: oErr } = await supabaseAdmin
      .from('review_orders')
      .select('id')
      .eq('coach_email', coachEmail);

    if (oErr) { res.status(500).json({ error: oErr.message }); return; }
    const orderIds = (orders || []).map(o => o.id);
    if (!orderIds.length) { res.status(200).json({ submissions: [] }); return; }

    const { data: vids, error: vErr } = await supabaseAdmin
      .from('videos')
      .select('id, owner_id, owner_email, owner_name, title, mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public')
      .in('review_order_id', orderIds)
      .order('created_at', { ascending: false });

    if (vErr) { res.status(500).json({ error: vErr.message }); return; }
    res.status(200).json({ submissions: vids ?? [] }); return;
  }

  // Case 3: by coachRef (if you populate it in videos or can map it via review_orders.metadata)
  if (coachRef) {
    const { data: orders, error: oErr } = await supabaseAdmin
      .from('review_orders')
      .select('id')
      .eq('coach_id', coachRef); // tweak if you store it under a different column
    if (oErr) { res.status(500).json({ error: oErr.message }); return; }

    const orderIds = (orders || []).map(o => o.id);
    if (!orderIds.length) { res.status(200).json({ submissions: [] }); return; }

    const { data: vids, error: vErr } = await supabaseAdmin
      .from('videos')
      .select('id, owner_id, owner_email, owner_name, title, mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public')
      .in('review_order_id', orderIds)
      .order('created_at', { ascending: false });

    if (vErr) { res.status(500).json({ error: vErr.message }); return; }
    res.status(200).json({ submissions: vids ?? [] }); return;
  }
});
