// pages/api/svr/mark-reviewed.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

type Json = Record<string, any>;

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  // 0) Parse and validate input ------------------------------------------------
  const { videoId, coachId, coachEmail, reviewSummary }: Json = req.body || {};
  if (!videoId || (!coachId && !coachEmail)) {
    res.status(400).json({ error: 'videoId and coach identity required' }); return;
  }

  // 1) Fetch the video ALONE (no joins) ---------------------------------------
  const { data: v0, error: e0 } = await supabaseAdmin
    .from('videos')
    .select(
      [
        'id',
        'title',
        'mux_playback_id',
        'playback_id',
        'owner_id',
        'owner_email',
        'coach_id',
        'review_order_id',
        'reviewed_at',
        'emailed_ready',
        'student_notified_at'
      ].join(', ')
    )
    .eq('id', videoId)
    .single();

  if (e0 || !v0) {
    console.log('[mark-reviewed] video lookup failed', { videoId, e0 });
    res.status(404).json({ error: 'Video not found' }); return;
  }

  // 2) Fetch optional related records (coach profile, student profile, order) --
  const [{ data: coachProfile }, { data: studentProfile }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', v0.coach_id)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', v0.owner_id)
      .maybeSingle()
  ]);

  let joined:
    | { id?: string; coach_id?: string; coach_email?: string; status?: string }
    | null = null;

  if (v0.review_order_id) {
    const { data: ro } = await supabaseAdmin
      .from('review_orders')
      .select('id, coach_id, coach_email, status')
      .eq('id', v0.review_order_id)
      .maybeSingle();
    joined = ro ?? null;
  }

  // 3) AuthZ: coach must match by id OR by email (order or profile) ------------
  const owns =
    (coachId && v0.coach_id === coachId) ||
    (coachEmail &&
      ((joined?.coach_email && joined.coach_email === coachEmail) ||
        (coachProfile?.email && coachProfile.email === coachEmail)));

  if (!owns) {
    console.log('[mark-reviewed] forbidden', {
      coachId,
      coachEmail,
      v_coach_id: v0.coach_id,
      joined_coach_email: joined?.coach_email,
      coach_profile_email: coachProfile?.email
    });
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  // 4) Idempotency: if already notified, no-op ---------------------------------
  if (v0.emailed_ready || v0.student_notified_at) {
    res.status(200).json({ ok: true, skipped: true, reason: 'already_notified' }); return;
  }

  // 5) Optional: load timestamped notes to include -----------------------------
  const { data: notes } = await supabaseAdmin
    .from('review_comments')
    .select('t, text')
    .eq('video_id', v0.id)
    .order('t', { ascending: true });

  // 6) Ensure reviewed_at is set (but don't mark emailed yet) ------------------
  if (!v0.reviewed_at) {
    const { error: upErr } = await supabaseAdmin
      .from('videos')
      .update({
        review_summary: reviewSummary ?? null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', v0.id);
    if (upErr) { res.status(500).json({ error: upErr.message }); return; }
  }

  // 7) Build outbound payload for Make -----------------------------------------
  const student = {
    id: studentProfile?.id ?? v0.owner_id,
    name: studentProfile?.full_name ?? '',
    email: studentProfile?.email ?? v0.owner_email
  };
  const coach = {
    id: coachProfile?.id ?? v0.coach_id ?? '',
    name: coachProfile?.full_name ?? '',
    email: coachProfile?.email ?? joined?.coach_email ?? ''
  };

  const payload = {
    type: 'svr.review.completed',
    idempotency_key: `video:${v0.id}`,
    review_order: { id: v0.review_order_id, status: 'reviewed' },
    student,
    coach,
    video: {
      id: v0.id,
      title: v0.title,
      mux_playback_id: v0.mux_playback_id ?? v0.playback_id ?? null
    },
    review: {
      summary: reviewSummary ?? null,
      timestamped_notes: (notes || []).map(n => ({ t: n.t, text: n.text }))
    },
    links: {
      student_review_url: `${process.env.PUBLIC_REVIEW_BASE || 'https://student-video-repo.vercel.app'}/student/review?vid=${v0.id}`
    }
  };

  if (!process.env.MAKE_REVIEWED_WEBHOOK_URL) {
    res.status(500).json({ error: 'MAKE_REVIEWED_WEBHOOK_URL not configured' }); return;
  }

  // 8) Send to Make; only mark emailed after 2xx --------------------------------
  try {
    // Helpful logs while you test; comment out later if noisy
    console.log('[mark-reviewed] → Make payload', JSON.stringify(payload));

    const resp = await fetch(process.env.MAKE_REVIEWED_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': payload.idempotency_key
      },
      body: JSON.stringify(payload)
    });

    console.log('[mark-reviewed] Make status', resp.status);

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      res.status(502).json({ error: 'Make webhook failed', detail }); return;
    }
  } catch (err: any) {
    res.status(502).json({ error: 'Make webhook error', detail: String(err?.message || err) }); return;
  }

  // 9) Final write-back: emailed + notified ------------------------------------
  const { error: finalErr, data: finalVid } = await supabaseAdmin
    .from('videos')
    .update({
      emailed_ready: true,
      student_notified_at: new Date().toISOString()
    })
    .eq('id', v0.id)
    .select()
    .single();

  if (finalErr) { res.status(500).json({ error: finalErr.message }); return; }

  res.status(200).json({ ok: true, video: finalVid });
});
