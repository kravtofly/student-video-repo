import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '../../../lib/supabase'
import { withCORS } from '../../../lib/cors'


export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method === 'GET') {
const videoId = req.query.videoId as string
if (!videoId) return res.status(400).json({ error: 'videoId required' })


const { data, error } = await supabaseServer
.from('review_comments')
.select('id, video_id, coach_id, t_seconds, body, created_at')
.eq('video_id', videoId)
.order('t_seconds', { ascending: true })


if (error) return res.status(500).json({ error: error.message })
return res.status(200).json({ notes: data })
}


if (req.method === 'POST') {
const { videoId, coachId, t, body } = req.body || {}
if (!videoId || !coachId || typeof t !== 'number' || !body) {
return res.status(400).json({ error: 'Invalid payload' })
}


// Ownership check (MVP): coach must own the video
const { data: vid } = await supabaseServer
.from('videos')
.select('id, coach_id')
.eq('id', videoId)
.single()


if (!vid || vid.coach_id !== coachId) return res.status(403).json({ error: 'Forbidden' })


const { data, error } = await supabaseServer
.from('review_comments')
.insert({ video_id: videoId, coach_id: coachId, t_seconds: t, body })
.select()
.single()


if (error) return res.status(500).json({ error: error.message })
return res.status(200).json({ note: data })
}


return res.status(405).end()
})
