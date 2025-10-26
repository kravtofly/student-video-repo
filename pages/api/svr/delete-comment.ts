// pages/api/svr/delete-comment.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.SVR_JWT_SECRET || '');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { commentId, videoId } = req.body || {};
    const token = req.query.token as string;

    if (!commentId || !videoId || !token) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Verify JWT token
    let coachEmail: string;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET, {
        issuer: 'student-video-repo',
        audience: 'svr-review',
      });
      coachEmail = payload.sub as string;
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Verify coach has access to this video
    const { data: vid, error: vErr } = await supabaseAdmin
      .from('videos')
      .select('id, coach_id, coach_ref, review_order_id, review_orders(coach_email)')
      .eq('id', videoId)
      .single();

    if (vErr || !vid) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const reviewOrder = Array.isArray(vid.review_orders)
      ? vid.review_orders[0]
      : vid.review_orders;

    const hasAccess =
      (vid.coach_ref && vid.coach_ref === coachEmail) ||
      (reviewOrder && reviewOrder.coach_email === coachEmail);

    if (!hasAccess) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Delete the comment
    const { error: deleteErr } = await supabaseAdmin
      .from('review_comments')
      .delete()
      .eq('id', commentId)
      .eq('video_id', videoId); // Extra safety check

    if (deleteErr) {
      console.error('[delete-comment] DB error:', deleteErr);
      res.status(500).json({ error: deleteErr.message });
      return;
    }

    console.log('[delete-comment] Success:', { commentId, videoId });

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[delete-comment] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete comment' });
  }
}

export default withCORS(handler);
