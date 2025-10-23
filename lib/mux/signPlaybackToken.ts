// lib/mux/signPlaybackToken.ts
import { SignJWT } from 'jose';
import { createPrivateKey } from 'crypto';

function loadPemKey() {
  let pem = process.env.MUX_SIGNING_PRIVATE_KEY || process.env.MUX_SIGNING_KEY_SECRET || '';
  if (!pem) throw new Error('MUX_SIGNING_PRIVATE_KEY or MUX_SIGNING_KEY_SECRET not set');

  // Convert escaped \n to real newlines if necessary
  if (pem.includes('\\n')) pem = pem.replace(/\\n/g, '\n');
  return createPrivateKey({ key: pem.trim(), format: 'pem' });
}

export async function signMuxPlaybackToken(playbackId: string, ttlSeconds = 60 * 60) {
  const kid = process.env.MUX_SIGNING_KEY_ID;
  if (!kid) throw new Error('MUX_SIGNING_KEY_ID not set');

  const keyObj = loadPemKey();

  return new SignJWT({ aud: 'v', sub: playbackId })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keyObj as any);
}
