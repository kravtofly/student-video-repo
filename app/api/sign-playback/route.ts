// app/api/sign-playback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, importPKCS8 } from 'jose';

/**
 * ENV required in Vercel:
 * - MUX_SIGNING_KEY_ID          (from Mux > Settings > Signing Keys)
 * - MUX_SIGNING_PRIVATE_KEY     (full PEM, including -----BEGIN PRIVATE KEY----- ... END ...)
 */

function cors(json: any, status = 200) {
  return new NextResponse(JSON.stringify(json), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': 'https://www.kravtofly.com',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-allow-credentials': 'true',
    },
  });
}

export async function OPTIONS() {
  return cors({ ok: true }, 200);
}

async function getPemKey() {
  const pem = process.env.MUX_SIGNING_PRIVATE_KEY || '';
  if (!pem) throw new Error('MUX_SIGNING_PRIVATE_KEY not set');
  // jose expects PKCS8 PEM
  return importPKCS8(pem, 'RS256');
}

async function signForPlayback(playbackId: string) {
  const kid = process.env.MUX_SIGNING_KEY_ID;
  if (!kid) throw new Error('MUX_SIGNING_KEY_ID not set');
  const key = await getPemKey();

  // Mux signed playback tokens: RS256, header.kid, payload { aud: 'v', sub: playbackId }
  const token = await new SignJWT({ aud: 'v', sub: playbackId })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  return token;
}

function extractPlaybackId(req: NextRequest, body: any) {
  const sp = req.nextUrl.searchParams;
  return (
    (sp.get('id') ||
      sp.get('playbackId') ||
      sp.get('pid') ||
      (body && (body.id || body.playbackId || body.pid)) ||
      '') as string
  ).trim();
}

export async function GET(req: NextRequest) {
  try {
    const playbackId = extractPlaybackId(req, null);
    if (!playbackId) return cors({ error: 'playbackId required (id|playbackId|pid)' }, 400);
    const token = await signForPlayback(playbackId);
    return cors({ token });
  } catch (err: any) {
    return cors({ error: 'SIGN_FAILED', message: String(err?.message || err) }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const playbackId = extractPlaybackId(req, body);
    if (!playbackId) return cors({ error: 'playbackId required (id|playbackId|pid)' }, 400);
    const token = await signForPlayback(playbackId);
    return cors({ token });
  } catch (err: any) {
    return cors({ error: 'SIGN_FAILED', message: String(err?.message || err) }, 500);
  }
}
