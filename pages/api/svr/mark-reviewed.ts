import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@lib/supabase';
import { withCORS } from '@lib/cors';

export default withCORS(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { videoId, coachId, coachEmail, reviewSummary } = req.body || {};
  if (!videoId || (!coachId && !coachEmail)) {
    res.status(400).json({ error: 'videoId and coach identity required' }); return;
  }

  // 1) Load video + joined review_order to verify ownership and gather email data
  const { data: vid, error: vErr } = await supabaseAdmin
    .from('videos')
    .select(`
      id, title, mux_playback_id, playback_id, owner_id, owner_email, coach_id,
      review_order_id, reviewed_at, emailed_ready, student_notified_at,
      review_orders (
        id, coach_id, coach_email, status
      ),
      profiles!videos_owner_id_fkey ( id, full_name, email ),
      coach_profile:profiles!videos_coach_id_fkey ( id, full_name, email )
    `)
    .eq('id', videoId)
    .single();

  if (vErr || !vid) { res.status(404).json({ error: 'Video not found' }); return; }

  // 2) AuthZ: coach must match by id or email
  const joined = (vid as any).review_orders as { coach_email?: string; coach_id?: string } | null;
  const owns =
    (coachId && vid.coach_id === coachId) ||
    (coachEmail && joined && joined.coach_email === coachEmail);

  if (!owns) { res.status(403).json({ error: 'Forbidden' }); return; }

  // 3) Idempotency: if we've already notified, no-op
  if (vid.emailed_ready || vid.student_notified_at) {
    res.status(200).json({ ok: true, skipped: true, reason: 'already_notified' });
    return;
  }

  // 4) (Optional) fetch timestamped notes to include
  const { data: notes } = await supabaseAdmin
    .from('review_comments')
    .select('t,text')
    .eq('video_id', videoId)
    .order('t', { ascending: true });

  // 5) Update reviewed_at (but DO NOT mark emailed yet)
  if (!vid.reviewed_at) {
    const { error: upErr } = await supabaseAdmin
      .from('videos')
      .update({
        review_summary: reviewSummary ?? null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', videoId);
    if (upErr) { res.status(500).json({ error: upErr.message }); return; }
  }

  // 6) Build outbound payload for Make
  const studentProfile = (vid as any).profiles ?? { full_name: null, email: vid.owner_email, id: vid.owner_id };
  const coachProfile = (vid as any).coach_profile ?? { full_name: null, email: joined?.coach_email, id: joined?.coach_id };

  const payload = {
    type: 'svr.review.completed',
    idempotency_key: `video:${vid.id}`,
    review_order: {
      id: vid.review_order_id,
      status: 'reviewed'
    },
    student: {
      id: studentProfile.id,
      name: studentProfile.full_name ?? '',
      email: studentProfile.email ?? vid.owner_email
    },
    coach: {
      id: coachProfile.id ?? vid.coach_id ?? '',
      name: coachProfile.full_name ?? '',
      email: coachProfile.email ?? ''
    },
    video: {
      id: vid.id,
      title: vid.title,
      mux_playback_id: vid.mux_playback_id ?? vid.playback_id ?? null
    },
    review: {
      summary: reviewSummary ?? null,
      timestamped_notes: (notes || []).map(n => ({ t: n.t, text: n.text }))
    },
    links: {
      student_review_url: `${process.env.PUBLIC_REVIEW_BASE || 'https://student-video-repo.vercel.app'}/student/review?vid=${vid.id}`
    }
  };

  // 7) Call Make webhook
  if (!process.env.MAKE_REVIEWED_WEBHOOK_URL) {
    res.status(500).json({ error: 'MAKE_REVIEWED_WEBHOOK_URL not configured' }); return;
  }

  const resp = await fetch(process.env.MAKE_REVIEWED_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': payload.idempotency_key
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    // Do NOT mark emailed; return 502 so the UI can toast "email failed"
    res.status(502).json({ error: 'Make webhook failed', detail });
    return;
  }

  // 8) Mark emailed + notified AFTER successful Make send
  const { error: finalErr, data: finalVid } = await supabaseAdmin
    .from('videos')
    .update({
      emailed_ready: true,
      student_notified_at: new Date().toISOString()
    })
    .eq('id', videoId)
    .select()
    .single();

  if (finalErr) { res.status(500).json({ error: finalErr.message }); return; }

  res.status(200).json({ ok: true, video: finalVid });
});
