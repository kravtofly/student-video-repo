// pages/api/svr/save-comment.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';
import Mux from '@mux/mux-node';

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
    const { uploadId } = req.body || {};

    if (!uploadId) {
      res.status(400).json({ error: 'Missing uploadId' });
      return;
    }

    console.log('[save-comment] Checking upload status:', uploadId);

    // Get the upload from Mux
    const upload = await mux.video.uploads.retrieve(uploadId);

    if (upload.status === 'waiting') {
      res.status(202).json({ status: 'processing', message: 'Upload still processing' });
      return;
    }

    if (upload.status === 'cancelled' || upload.status === 'errored') {
      res.status(400).json({ error: `Upload ${upload.status}` });
      return;
    }

    if (!upload.asset_id) {
      res.status(400).json({ error: 'No asset created yet' });
      return;
    }

    // Get the asset
    const asset = await mux.video.assets.retrieve(upload.asset_id);
    const playbackId = asset.playback_ids?.[0]?.id;

    if (!playbackId) {
      res.status(400).json({ error: 'No playback ID available' });
      return;
    }

    // Parse passthrough metadata
    const passthrough = asset.passthrough ? JSON.parse(asset.passthrough) : null;

    if (!passthrough || passthrough.type !== 'comment') {
      res.status(400).json({ error: 'Invalid passthrough data' });
      return;
    }

    const { videoId, timestamp, mediaType, coachEmail } = passthrough;

    console.log('[save-comment] Saving to database:', { videoId, timestamp, mediaType, playbackId });

    // Save comment to database
    const { data: comment, error: commentErr } = await supabaseAdmin
      .from('review_comments')
      .insert({
        video_id: videoId,
        t_seconds: timestamp,
        body: mediaType === 'audio' ? 'Audio comment' : 'Video comment',
        media_type: mediaType,
        media_playback_id: playbackId,
      })
      .select()
      .single();

    if (commentErr) {
      console.error('[save-comment] DB error:', commentErr);
      res.status(500).json({ error: commentErr.message });
      return;
    }

    console.log('[save-comment] Success:', comment.id);

    res.status(200).json({ ok: true, comment });
  } catch (err: any) {
    console.error('[save-comment] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to save comment' });
  }
}

export default withCORS(handler);
