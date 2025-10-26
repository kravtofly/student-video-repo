// pages/api/svr/upload-media-comment.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';
import Mux from '@mux/mux-node';
import formidable from 'formidable';
import fs from 'fs';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.SVR_JWT_SECRET || '');

// Initialize Mux client
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Parse multipart form data
    const form = formidable({ maxFileSize: 100 * 1024 * 1024 }); // 100MB max
    const [fields, files] = await form.parse(req);

    const videoId = fields.videoId?.[0];
    const timestamp = fields.timestamp?.[0];
    const mediaType = fields.mediaType?.[0]; // "audio" or "video"
    const token = fields.token?.[0];
    const file = files.file?.[0];

    if (!videoId || !timestamp || !mediaType || !token || !file) {
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

    // Upload to Mux
    console.log('[upload-media-comment] Uploading to Mux:', { mediaType, size: file.size });

    // Read file as buffer
    const fileBuffer = fs.readFileSync(file.filepath);

    // Create a direct upload URL
    const upload = await mux.video.uploads.create({
      cors_origin: process.env.MUX_CORS_ORIGIN || '*',
      new_asset_settings: {
        playback_policy: ['public'],
        mp4_support: 'standard',
      },
    });

    // Upload file to Mux upload URL
    const uploadResponse = await fetch(upload.url, {
      method: 'PUT',
      body: fileBuffer,
      headers: {
        'Content-Type': mediaType === 'audio' ? 'audio/webm' : 'video/webm',
      },
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload to Mux');
    }

    // Wait a moment for Mux to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the asset from the upload
    const assetFromUpload = await mux.video.uploads.retrieve(upload.id);
    if (!assetFromUpload.asset_id) {
      throw new Error('Mux asset not ready yet');
    }

    const asset = await mux.video.assets.retrieve(assetFromUpload.asset_id);
    const playbackId = asset.playback_ids?.[0]?.id;

    if (!playbackId) {
      throw new Error('No playback ID from Mux');
    }

    console.log('[upload-media-comment] Mux upload complete:', { playbackId });

    // Save comment to database
    const { data: comment, error: commentErr } = await supabaseAdmin
      .from('review_comments')
      .insert({
        video_id: videoId,
        t_seconds: parseInt(timestamp, 10),
        body: mediaType === 'audio' ? 'Audio comment' : 'Video comment',
        media_type: mediaType,
        media_playback_id: playbackId,
      })
      .select()
      .single();

    if (commentErr) {
      console.error('[upload-media-comment] DB error:', commentErr);
      res.status(500).json({ error: commentErr.message });
      return;
    }

    // Clean up temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (e) {
      // Ignore cleanup errors
    }

    res.status(200).json({ ok: true, comment });
  } catch (err: any) {
    console.error('[upload-media-comment] Error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
}

export default withCORS(handler);
