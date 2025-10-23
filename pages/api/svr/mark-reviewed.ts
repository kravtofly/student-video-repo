// pages/api/svr/mark-reviewed.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabaseAdmin';
import { withCORS } from '@lib/cors';

type Json = Record<string, any>;

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  // 0) Parse + validate --------------------------------------------------------
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
        'coach_ref',
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

  // Use a narrow "any" for id fields to keep TS happy without over-typing
  const v: any = v0;

  // 2) Optional related lookups (sequential to avoid TS tuple inference) ------
  const { data: coachProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', v.coach_id as string)
    .maybeSingle();

  const { data: studentProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', v.owner_id as string)
    .maybeSingle();

  let joined:
    | { id?: string; coach_id?: string; coach_email?: string; status?: string }
    | null = null;

  if (v.review_order_id) {
    const { data: ro } = await supabaseAdmin
      .from('review_orders')
      .select('id, coach_id, coach_email, status')
      .eq('id', v.review_order_id as string)
      .maybeSingle();
    joined = ro ?? null;
  }

  // 3) AuthZ: coach must match by id OR by email (order, profile, or coach_ref) ------------
  const owns =
    (coachId && v.coach_id === coachId) ||
    (coachEmail &&
      ((joined?.coach_email && joined.coach_email === coachEmail) ||
        (coachProfile?.email && coachProfile.email === coachEmail) ||
        (v.coach_ref === coachEmail)));

  if (!owns) {
    console.log('[mark-reviewed] forbidden', {
      coachId,
      coachEmail,
      v_coach_id: v.coach_id,
      joined_coach_email: joined?.coach_email,
      coach_profile_email: coachProfile?.email
    });
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  // 4) Idempotency: if already notified, no-op ---------------------------------
  if (v.emailed_ready || v.student_notified_at) {
    res.status(200).json({ ok: true, skipped: true, reason: 'already_notified' }); return;
  }

  // 5) Optional: timestamped notes --------------------------------------------
  const { data: notes } = await supabaseAdmin
    .from('review_comments')
    .select('t_seconds, body')
    .eq('video_id', v.id as string)
    .order('t_seconds', { ascending: true });

  // 6) Ensure reviewed_at set (don’t mark emailed yet) -------------------------
  if (!v.reviewed_at) {
    const { error: upErr } = await supabaseAdmin
      .from('videos')
      .update({
        review_summary: reviewSummary ?? null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', v.id as string);
    if (upErr) { res.status(500).json({ error: upErr.message }); return; }
  }

  // 7) Build payload for Make ---------------------------------------------------
  const student = {
    id: (studentProfile?.id ?? v.owner_id) as string,
    name: studentProfile?.full_name ?? '',
    email: studentProfile?.email ?? (v.owner_email as string)
  };
  const coach = {
    id: (coachProfile?.id ?? v.coach_id ?? '') as string,
    name: coachProfile?.full_name ?? '',
    email: coachProfile?.email ?? (joined?.coach_email ?? '')
  };

  const payload = {
    type: 'svr.review.completed',
    idempotency_key: `video:${v.id}`,
    review_order: { id: v.review_order_id, status: 'reviewed' },
    student,
    coach,
    video: {
      id: v.id,
      title: v.title,
      mux_playback_id: v.mux_playback_id ?? v.playback_id ?? null
    },
    review: {
      summary: reviewSummary ?? null,
      timestamped_notes: (notes || []).map((n: any) => ({ t: n.t_seconds, text: n.body }))
    },
    links: {
      student_review_url: `${process.env.PUBLIC_REVIEW_BASE || 'https://student-video-repo.vercel.app'}/student/review?vid=${v.id}`
    }
  };

  if (!process.env.MAKE_REVIEWED_WEBHOOK_URL) {
    res.status(500).json({ error: 'MAKE_REVIEWED_WEBHOOK_URL not configured' }); return;
  }

  // 8) Send to Make; only mark emailed after 2xx -------------------------------
  try {
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
    .eq('id', v.id as string)
    .select()
    .single();

  if (finalErr) { res.status(500).json({ error: finalErr.message }); return; }

  res.status(200).json({ ok: true, video: finalVid });
});
