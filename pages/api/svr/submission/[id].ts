import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';
import { signMuxPlaybackToken } from '@lib/mux/signPlaybackToken';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const id = req.query.id as string;
  if (!id) { res.status(400).json({ error: 'id required' }); return; }

  const { data: video, error } = await supabaseAdmin
    .from('videos')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !video) { res.status(404).json({ error: 'Not found' }); return; }

  const playbackId: string | undefined = video.mux_playback_id || video.playback_id;
  if (!playbackId) { res.status(400).json({ error: 'Missing playback id' }); return; }

  const playbackToken = await signMuxPlaybackToken(playbackId);
  res.status(200).json({ submission: video, playbackToken });
  return;
});
