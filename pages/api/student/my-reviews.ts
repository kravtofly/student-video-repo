// pages/api/student/my-reviews.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { withCORS } from '@lib/cors';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.SVR_JWT_SECRET || '');

async function requireEmail(req: NextApiRequest): Promise<string> {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new Error('no token');
  const { payload } = await jwtVerify(token, SECRET, {
    issuer: 'student-video-repo',
    audience: 'svr-student'
  });
  const email = String(payload.sub || '').toLowerCase();
  if (!email) throw new Error('no sub');
  return email;
}

export default withCORS(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const email = await requireEmail(req);

    const { data, error } = await supabaseAdmin
      .from('videos')
      .select('id, title, mux_playback_id, playback_id, review_summary, reviewed_at, owner_email, coach_ref, review_order_id, review_orders(coach_email, coach_name)')
      .eq('owner_email', email)
      .not('reviewed_at', 'is', null)
      .order('reviewed_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    const items = (data || []).map(v => {
      const reviewOrder = (v as any).review_orders;
      const coachEmail = (v as any).coach_ref || (reviewOrder && reviewOrder.coach_email) || null;
      const coachName = reviewOrder && reviewOrder.coach_name ? reviewOrder.coach_name : (coachEmail ? coachEmail.split('@')[0] : 'Coach');

      return {
        videoId: v.id,
        title: v.title || 'Session video',
        reviewedAt: v.reviewed_at,
        playbackId: v.mux_playback_id ?? v.playback_id ?? null,
        summary: v.review_summary ?? '',
        coachName: coachName
      };
    });

    res.json({ items });
  } catch (e: any) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});
