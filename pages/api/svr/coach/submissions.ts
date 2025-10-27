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
    // Use left join to include videos without review_orders
    let query = supabaseAdmin
      .from('videos')
      .select('id, owner_id, owner_email, owner_name, title, mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public, review_order_id, review_orders(offer_type)')
      .eq('coach_id', coachId);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }

    // Filter in JavaScript to handle NULL offer_type values
    // Treat NULL/missing offer_type as "quick" for backwards compatibility
    let filtered = data || [];
    if (offerType === 'quick') {
      filtered = filtered.filter((v: any) => {
        const reviewOrder = Array.isArray(v.review_orders) ? v.review_orders[0] : v.review_orders;
        const type = reviewOrder?.offer_type;
        return !type || type === 'quick'; // NULL or 'quick'
      });
    } else if (offerType === 'deep') {
      filtered = filtered.filter((v: any) => {
        const reviewOrder = Array.isArray(v.review_orders) ? v.review_orders[0] : v.review_orders;
        return reviewOrder?.offer_type === 'deep';
      });
    } else if (offerType) {
      // For any other specific offer type (e.g., 'flight_labs'), filter exactly
      filtered = filtered.filter((v: any) => {
        const reviewOrder = Array.isArray(v.review_orders) ? v.review_orders[0] : v.review_orders;
        return reviewOrder?.offer_type === offerType;
      });
    }
    // If offerType is empty/null, don't filter (return all)

    // Clean up the response to remove the nested review_orders
    const cleanData = filtered.map((v: any) => ({
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
    // Get all orders for this coachEmail with offer_type info
    let ordersQuery = supabaseAdmin
      .from('review_orders')
      .select('id, offer_type')
      .eq('coach_email', coachEmail);

    const { data: orders, error: oErr } = await ordersQuery;
    if (oErr) { res.status(500).json({ error: oErr.message }); return; }

    // Filter orders by offer_type, treating NULL as "quick" for backwards compatibility
    let filteredOrders = orders || [];
    if (offerType === 'quick') {
      filteredOrders = filteredOrders.filter(o => !o.offer_type || o.offer_type === 'quick');
    } else if (offerType === 'deep') {
      filteredOrders = filteredOrders.filter(o => o.offer_type === 'deep');
    } else if (offerType) {
      // For any other specific offer type (e.g., 'flight_labs'), filter exactly
      filteredOrders = filteredOrders.filter(o => o.offer_type === offerType);
    }
    // If offerType is empty/null, don't filter (return all)

    const orderIds = filteredOrders.map(o => o.id);
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
      .select('id, offer_type')
      .eq('coach_id', coachRef); // tweak if you store it under a different column

    const { data: orders, error: oErr } = await ordersQuery;
    if (oErr) { res.status(500).json({ error: oErr.message }); return; }

    // Filter orders by offer_type, treating NULL as "quick" for backwards compatibility
    let filteredOrders = orders || [];
    if (offerType === 'quick') {
      filteredOrders = filteredOrders.filter(o => !o.offer_type || o.offer_type === 'quick');
    } else if (offerType === 'deep') {
      filteredOrders = filteredOrders.filter(o => o.offer_type === 'deep');
    } else if (offerType) {
      // For any other specific offer type (e.g., 'flight_labs'), filter exactly
      filteredOrders = filteredOrders.filter(o => o.offer_type === offerType);
    }
    // If offerType is empty/null, don't filter (return all)

    const orderIds = filteredOrders.map(o => o.id);
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
