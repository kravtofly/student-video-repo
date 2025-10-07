// pages/api/student/magic/start.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { withCORS } from '@lib/cors';
import { supabaseAdmin } from '@lib/supabase';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.SVR_JWT_SECRET || '');

function bad(res: NextApiResponse, code: number, msg: string) {
  res.status(code).json({ error: msg });
}

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { email: rawEmail } = (req.body || {}) as { email?: string };
    if (!rawEmail || typeof rawEmail !== 'string') return bad(res, 400, 'Email required');

    if (!process.env.PUBLIC_STUDENT_PORTAL_URL) return bad(res, 500, 'PUBLIC_STUDENT_PORTAL_URL not set');
    if (!process.env.MAKE_STUDENT_MAGIC_WEBHOOK_URL) return bad(res, 500, 'MAKE_STUDENT_MAGIC_WEBHOOK_URL not set');
    if (!JWT_SECRET || JWT_SECRET.length < 32) return bad(res, 500, 'SVR_JWT_SECRET too short');

    const email = rawEmail.trim().toLowerCase();

    // OPTIONAL: basic format sanity (don’t block hard to avoid user frustration)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // still return ok to avoid enumeration
      return res.json({ ok: true });
    }

    // Create a short-lived token (30 min)
    const jti = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 30 * 60; // 30 minutes

    const token = await new SignJWT({ sub: email, typ: 'svr_magic', jti })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setIssuer('student-video-repo')
      .setAudience('svr-student')
      .sign(JWT_SECRET);

    const expiresAtISO = new Date(exp * 1000).toISOString();

    // Store audit row (for future revocation/reporting)
    await supabaseAdmin.from('magic_links').insert({
      email,
      jti,
      expires_at: expiresAtISO,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
      user_agent: req.headers['user-agent'] || null
    });

    // Build the link to your Webflow page
    // Use query param (?token=...) to keep it simple for Webflow scripts
    const link = `${process.env.PUBLIC_STUDENT_PORTAL_URL}?token=${encodeURIComponent(token)}`;

    // Send via Make
    const payload = {
      type: 'svr.student.magic_link',
      idempotency_key: `magic:${jti}`,
      email,
      link,
      expires_at: expiresAtISO
    };

    const resp = await fetch(process.env.MAKE_STUDENT_MAGIC_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': payload.idempotency_key
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return bad(res, 502, `Make webhook failed: ${detail}`);
    }

    // Always respond ok (avoid email enumeration leaks)
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
