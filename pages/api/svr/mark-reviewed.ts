import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'POST') return res.status(405).end()


const { videoId, coachId, reviewSummary } = req.body || {}
if (!videoId || !coachId) return res.status(400).json({ error: 'videoId and coachId required' })


// Ownership check
const { data: vid, error: vErr } = await supabaseServer
.from('videos')
.select('id, coach_id, owner_email, owner_id, title, mux_playback_id, playback_id')
.eq('id', videoId)
.single()
if (vErr || !vid) return res.status(404).json({ error: 'Video not found' })
if (vid.coach_id !== coachId) return res.status(403).json({ error: 'Forbidden' })


const { data, error } = await supabaseServer
.from('videos')
.update({
review_summary: reviewSummary ?? null,
reviewed_at: new Date().toISOString(),
emailed_ready: true,
student_notified_at: new Date().toISOString(),
})
.eq('id', videoId)
.select()
.single()


if (error) return res.status(500).json({ error: error.message })


// Optional: notify via Make webhook
if (process.env.MAKE_REVIEWED_WEBHOOK_URL) {
try {
await fetch(process.env.MAKE_REVIEWED_WEBHOOK_URL, {
method: 'POST',
headers: { 'content-type': 'application/json' },
body: JSON.stringify({ video: data })
})
} catch (e) {
// swallow to avoid failing UX; Make can be retried separately
}
}


res.status(200).json({ ok: true, video: data })
})
