// pages/api/sign-playback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { withCORS } from '@lib/cors';
import { SignJWT, importPKCS8 } from 'jose';

// ENV you need in Vercel:
// - MUX_SIGNING_KEY_ID         (from Mux "Signing Keys")
// - MUX_SIGNING_PRIVATE_KEY     (full PEM string, including -----BEGIN PRIVATE KEY----- ...)

async function getPrivateKey() {
  const pem = process.env.MUX_SIGNING_PRIVATE_KEY || '';
  if (!pem) throw new Error('MUX_SIGNING_PRIVATE_KEY not set');
  // jose expects PKCS8 PEM without extra quotes
  return importPKCS8(pem, 'RS256');
}

export default withCORS(async (req: NextApiRequest, res: NextApiResponse) => {
  // Accept GET or POST
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') return res.status(405).end();

  try {
    const kid = process.env.MUX_SIGNING_KEY_ID;
    if (!kid) return res.status(500).json({ error: 'MUX_SIGNING_KEY_ID not set' });

    // Accept a bunch of param names: id | playbackId | pid (GET or POST)
    const qp = req.query as Record<string, any>;
    const body = (req.body ?? {}) as Record<string, any>;
    const playbackId =
      String(qp.id ?? qp.playbackId ?? qp.pid ?? body.id ?? body.playbackId ?? body.pid ?? '').trim();

    if (!playbackId) return res.status(400).json({ error: 'playbackId required (id|playbackId|pid)' });

    const key = await getPrivateKey();

    // Per Mux docs: header.kid, RS256; payload: { sub: playbackId, aud: 'v', exp }
    const token = await new SignJWT({ aud: 'v', sub: playbackId })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    res.json({ token });
  } catch (err: any) {
    res.status(500).json({ error: 'SIGN_FAILED', message: String(err?.message || err) });
  }
});
