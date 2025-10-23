import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';
import { SignJWT } from 'jose';

/**
 * Mints a short-lived JWT token for coaches to access review pages.
 *
 * Query params:
 *   - videoId: the video/submission ID
 *   - coachEmail: the coach's email address
 *
 * Returns:
 *   - { token: "jwt..." } on success
 *   - { error: "..." } on failure
 */

const JWT_SECRET = new TextEncoder().encode(process.env.SVR_JWT_SECRET || '');
const TOKEN_TTL_SECONDS = 3600; // 1 hour

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const videoId = req.query.videoId as string;
  const coachEmail = req.query.coachEmail as string;

  if (!videoId || !coachEmail) {
    res.status(400).json({ error: 'videoId and coachEmail required' });
    return;
  }

  if (!process.env.SVR_JWT_SECRET || JWT_SECRET.length < 32) {
    res.status(500).json({ error: 'SVR_JWT_SECRET not configured or too short' });
    return;
  }

  try {
    // Verify the coach has access to this video
    const { data: vid, error: vErr } = await supabaseAdmin
      .from('videos')
      .select(`
        id, coach_id, coach_ref, review_order_id,
        review_orders(id, coach_email, coach_id)
      `)
      .eq('id', videoId)
      .single();

    if (vErr || !vid) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const joined = (vid as any).review_orders as { coach_email?: string; coach_id?: string } | null;

    // Verify coach owns this video (same logic as notes.ts)
    const owns =
      (joined && joined.coach_email === coachEmail) ||
      ((vid as any).coach_ref === coachEmail);

    if (!owns) {
      res.status(403).json({ error: 'Forbidden: Coach does not have access to this video' });
      return;
    }

    // Mint a short-lived JWT token
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: coachEmail,
      videoId,
      typ: 'svr_review',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .setIssuer('student-video-repo')
      .setAudience('svr-review')
      .sign(JWT_SECRET);

    res.status(200).json({ token });

  } catch (err: any) {
    console.error('[review-token] error:', err?.message || err);
    res.status(500).json({ error: 'Failed to mint token' });
  }
});
