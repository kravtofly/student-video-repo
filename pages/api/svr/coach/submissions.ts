import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const coachId = (req.query.coachId as string) || '';
  const coachEmail = (req.query.coachEmail as string) || '';
  const coachRef = (req.query.coachRef as string) || '';
  const offerType = (req.query.offerType as string) || ''; // "quick" or "deep"

  if (!coachId && !coachEmail && !coachRef) {
    res.status(400).json({ error: 'Provide coachId OR coachEmail OR coachRef' }); return;
  }

  // Case 1: direct by videos.coach_id
  if (coachId) {
    // For coach_id, we need to join with review_orders to filter by offer_type
    let query = supabaseAdmin
      .from('videos')
      .select('id, owner_id, owner_email, owner_name, title, mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public, review_order_id, review_orders!inner(offer_type)')
      .eq('coach_id', coachId);

    if (offerType === 'quick' || offerType === 'deep') {
      query = query.eq('review_orders.offer_type', offerType);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }

    // Clean up the response to remove the nested review_orders
    const cleanData = (data || []).map((v: any) => ({
      id: v.id,
      owner_id: v.owner_id,
      owner_email: v.owner_email,
      owner_name: v.owner_name,
      title: v.title,
      mux_playback_id: v.mux_playback_id,
      playback_id: v.playback_id,
      created_at: v.created_at,
      reviewed_at: v.reviewed_at,
      review_summary: v.review_summary,
      status: v.status,
      is_public: v.is_public,
    }));

    res.status(200).json({ submissions: cleanData }); return;
  }

  // Case 2: by coachEmail via review_orders
  if (coachEmail) {
    // get all order ids for this coachEmail, optionally filtered by offer_type
    let ordersQuery = supabaseAdmin
      .from('review_orders')
      .select('id')
      .eq('coach_email', coachEmail);

    if (offerType === 'quick' || offerType === 'deep') {
      ordersQuery = ordersQuery.eq('offer_type', offerType);
    }

    const { data: orders, error: oErr } = await ordersQuery;

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
    let ordersQuery = supabaseAdmin
      .from('review_orders')
      .select('id')
      .eq('coach_id', coachRef); // tweak if you store it under a different column

    if (offerType === 'quick' || offerType === 'deep') {
      ordersQuery = ordersQuery.eq('offer_type', offerType);
    }

    const { data: orders, error: oErr } = await ordersQuery;
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
