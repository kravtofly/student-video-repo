// lib/mux/signPlaybackToken.ts
import jwt, { type JwtHeader, type SignOptions, type Secret } from 'jsonwebtoken';

export function signMuxPlaybackToken(playbackId: string, ttlSeconds = 60 * 60) {
  const secret = process.env.MUX_SIGNING_KEY_SECRET;
  const kid = process.env.MUX_SIGNING_KEY_ID;

  if (!secret || !kid) {
    throw new Error('Missing MUX signing env vars');
  }

  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

  // Mux requires RS256 with a PEM private key and a kid header
  const header: JwtHeader = { alg: 'RS256', kid, typ: 'JWT' };
  const options: SignOptions = { algorithm: 'RS256', header };

  const payload = { aud: 'v', sub: playbackId, exp };

  return jwt.sign(payload, secret as Secret, options);
}
