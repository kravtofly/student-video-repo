// pages/api/student/review/[vid].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { withCORS } from '@lib/cors';
import { supabaseAdmin } from '@lib/supabase';
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
    const vid = String(req.query.vid || '');

    if (!vid) return res.status(400).json({ error: 'Missing vid' });

    // Get the video and ensure ownership + reviewed
    const { data: v, error: e0 } = await supabaseAdmin
      .from('videos')
      .select('id, title, mux_playback_id, playback_id, review_summary, reviewed_at, owner_email')
      .eq('id', vid)
      .single();

    if (e0 || !v) return res.status(404).json({ error: 'Not found' });
    if (!v.reviewed_at) return res.status(403).json({ error: 'Not reviewed yet' });
    if ((v.owner_email || '').toLowerCase() !== email) return res.status(403).json({ error: 'Forbidden' });

    // Notes
    const { data: notes } = await supabaseAdmin
      .from('review_comments')
      .select('t, text')
      .eq('video_id', v.id)
      .order('t', { ascending: true });

    res.json({
      video: {
        id: v.id,
        title: v.title || 'Session video',
        playbackId: v.mux_playback_id ?? v.playback_id ?? null,
        reviewedAt: v.reviewed_at,
        summary: v.review_summary ?? ''
      },
      notes: notes || []
    });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});
