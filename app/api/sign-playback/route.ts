// app/api/sign-playback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, importPKCS8, importPKCS1 } from 'jose';

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
export function OPTIONS() { return cors({ ok: true }); }

// Normalize PEM: support pasted with \n and both PKCS8 / PKCS1 (RSA) formats
async function loadPrivateKey() {
  const raw = process.env.MUX_SIGNING_PRIVATE_KEY || '';
  if (!raw) throw new Error('MUX_SIGNING_PRIVATE_KEY not set');

  // Convert escaped newlines to real newlines if needed
  const pem = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;

  if (pem.includes('BEGIN PRIVATE KEY')) {
    return importPKCS8(pem, 'RS256'); // PKCS8
  }
  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    return importPKCS1(pem, 'RS256'); // PKCS1 / “RSA PRIVATE KEY”
  }
  throw new Error('Unrecognized private key format. Expected BEGIN PRIVATE KEY or BEGIN RSA PRIVATE KEY.');
}

async function signForPlayback(playbackId: string) {
  const kid = process.env.MUX_SIGNING_KEY_ID;
  if (!kid) throw new Error('MUX_SIGNING_KEY_ID not set');

  const key = await loadPrivateKey();

  // Mux signed playback tokens: payload { aud: 'v', sub: playbackId }, RS256, header.kid
  return new SignJWT({ aud: 'v', sub: playbackId })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

function getPlaybackId(req: NextRequest, body: any) {
  const sp = req.nextUrl.searchParams;
  return (
    (sp.get('id') || sp.get('playbackId') || sp.get('pid') ||
      (body && (body.id || body.playbackId || body.pid)) || ''
    ) as string
  ).trim();
}

export async function GET(req: NextRequest) {
  try {
    const playbackId = getPlaybackId(req, null);
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
    const playbackId = getPlaybackId(req, body);
    if (!playbackId) return cors({ error: 'playbackId required (id|playbackId|pid)' }, 400);
    const token = await signForPlayback(playbackId);
    return cors({ token });
  } catch (err: any) {
    return cors({ error: 'SIGN_FAILED', message: String(err?.message || err) }, 500);
  }
}
