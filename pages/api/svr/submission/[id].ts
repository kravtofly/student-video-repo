import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';
import { signMuxPlaybackToken } from '@lib/mux/signPlaybackToken';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'GET') return res.status(405).end()
const id = req.query.id as string
if (!id) return res.status(400).json({ error: 'id required' })


const { data: video, error } = await supabaseServer
.from('videos')
.select('*')
.eq('id', id)
.single()


if (error || !video) return res.status(404).json({ error: 'Not found' })


const playbackId: string | undefined = video.mux_playback_id || video.playback_id
if (!playbackId) return res.status(400).json({ error: 'Missing playback id' })


const playbackToken = signMuxPlaybackToken(playbackId)
res.status(200).json({ submission: video, playbackToken })
})
