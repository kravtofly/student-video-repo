// pages/api/svr/create-comment-upload.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';
import Mux from '@mux/mux-node';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.SVR_JWT_SECRET || '');

// Initialize Mux client
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { videoId, timestamp, mediaType, token } = req.body || {};

    if (!videoId || timestamp === undefined || !mediaType || !token) {
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

    // Create direct upload URL with passthrough metadata
    const upload = await mux.video.uploads.create({
      cors_origin: process.env.MUX_CORS_ORIGIN ||
                   process.env.ALLOWED_ORIGINS?.split(',')[0] ||
                   '*',
      new_asset_settings: {
        playback_policy: ['public'],
        // Mark this as a comment upload (not a student video)
        passthrough: JSON.stringify({
          type: 'comment',
          videoId,
          timestamp: parseInt(timestamp, 10),
          mediaType,
          coachEmail,
        }),
      },
    });

    console.log('[create-comment-upload] Created Mux upload:', { uploadId: upload.id, mediaType });

    res.status(200).json({
      uploadUrl: upload.url,
      uploadId: upload.id,
    });
  } catch (err: any) {
    console.error('[create-comment-upload] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create upload' });
  }
}

export default withCORS(handler);
