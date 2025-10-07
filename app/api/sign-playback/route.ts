// app/api/sign-playback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createPrivateKey, KeyObject } from 'crypto';

/**
 * Env:
 * - MUX_SIGNING_KEY_ID
 * - MUX_SIGNING_PRIVATE_KEY   (optional; PKCS8)
 * - MUX_SIGNING_KEY_SECRET    (optional; PKCS1/RSA or PKCS8)
 */

function allowOrigin(req: NextRequest) {
  const o = req.headers.get('origin') || '';
  if (o === 'https://www.kravtofly.com' || o === 'https://kravtofly.com') return o;
  return 'https://www.kravtofly.com';
}
function cors(req: NextRequest, json: any, status = 200) {
  return new NextResponse(JSON.stringify(json), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': allowOrigin(req),
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-allow-credentials': 'true',
    },
  });
}
export function OPTIONS(req: NextRequest) { return cors(req, { ok: true }); }

function readPemFromEnv(): string {
  let pem =
    process.env.MUX_SIGNING_PRIVATE_KEY ||
    process.env.MUX_SIGNING_KEY_SECRET ||
    '';
  if (!pem) throw new Error('MUX_SIGNING_PRIVATE_KEY or MUX_SIGNING_KEY_SECRET not set');

  // Convert escaped \n to real newlines if necessary
  if (pem.includes('\\n')) pem = pem.replace(/\\n/g, '\n');
  return pem.trim();
}

function loadAnyPemKey(): KeyObject {
  const pem = readPemFromEnv();
  // Let Node parse PKCS1 (RSA) or PKCS8 transparently.
  // If the PEM is malformed (e.g., header edited), createPrivateKey will throw.
  return createPrivateKey({ key: pem, format: 'pem' });
}

async function signForPlayback(playbackId: string) {
  const kid = process.env.MUX_SIGNING_KEY_ID;
  if (!kid) throw new Error('MUX_SIGNING_KEY_ID not set');

  const keyObj = loadAnyPemKey(); // KeyObject usable directly by jose

  return new SignJWT({ aud: 'v', sub: playbackId })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(keyObj as any);
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
    if (!playbackId) return cors(req, { error: 'playbackId required (id|playbackId|pid)' }, 400);
    const token = await signForPlayback(playbackId);
    return cors(req, { token });
  } catch (err: any) {
    return cors(req, { error: 'SIGN_FAILED', message: String(err?.message || err) }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const playbackId = getPlaybackId(req, body);
    if (!playbackId) return cors(req, { error: 'playbackId required (id|playbackId|pid)' }, 400);
    const token = await signForPlayback(playbackId);
    return cors(req, { token });
  } catch (err: any) {
    return cors(req, { error: 'SIGN_FAILED', message: String(err?.message || err) }, 500);
  }
}
