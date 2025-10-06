import jwt from 'jsonwebtoken'


export function signMuxPlaybackToken(playbackId: string, ttlSeconds = 60 * 60) {
if (!process.env.MUX_SIGNING_KEY_SECRET || !process.env.MUX_SIGNING_KEY_ID) {
throw new Error('Missing MUX signing env vars')
}
const exp = Math.floor(Date.now() / 1000) + ttlSeconds
const token = jwt.sign(
{ aud: 'v', sub: playbackId, exp },
process.env.MUX_SIGNING_KEY_SECRET,
{ header: { kid: process.env.MUX_SIGNING_KEY_ID } }
)
return token
}
