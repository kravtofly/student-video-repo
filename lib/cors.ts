import type { NextApiRequest, NextApiResponse } from 'next'


const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
.split(',')
.map(s => s.trim())
.filter(Boolean)


export function withCORS(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void) {
return async function corsWrapped(req: NextApiRequest, res: NextApiResponse) {
const origin = req.headers.origin || ''
if (ALLOWED.includes(origin)) {
res.setHeader('Access-Control-Allow-Origin', origin)
res.setHeader('Vary', 'Origin')
}
res.setHeader('Access-Control-Allow-Credentials', 'true')
res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')


if (req.method === 'OPTIONS') {
res.status(204).end()
return
}
return handler(req, res)
}
}
