import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseServer } from '../../../lib/supabase'
import { withCORS } from '../../../lib/cors'


export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== 'GET') return res.status(405).end()


const coachId = (req.query.coachId as string) || ''
if (!coachId) return res.status(400).json({ error: 'coachId required' })


const { data, error } = await supabaseServer
.from('videos')
.select('id, owner_id, owner_email, owner_name, title, mux_playback_id, playback_id, created_at, reviewed_at, review_summary, status, is_public')
.eq('coach_id', coachId)
.order('created_at', { ascending: false })


if (error) return res.status(500).json({ error: error.message })
res.status(200).json({ submissions: data })
})
