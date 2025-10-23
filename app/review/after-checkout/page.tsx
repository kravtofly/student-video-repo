// app/review/after-checkout/page.tsx
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const APP_URL = process.env.PUBLIC_APP_URL || "https://student-video-repo.vercel.app";
const KRAV_UPLOAD_URL = "https://www.kravtofly.com/review/upload"; // Webflow upload page

async function getCoach(coachId: string) {
  const { data, error } = await supabaseAdmin
    .from("coaches")
    .select("id, name, slug, cal_username, deep_event_slug, quick_price_cents, deep_price_cents")
    .eq("id", coachId)
    .single();

  if (error || !data) throw new Error("Coach not found");
  return data as {
    id: string;
    name: string;
    slug: string | null;
    cal_username: string | null;
    deep_event_slug: string | null;
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;
  if (!sessionId) {
    return redirect(`${APP_URL}/?err=missing_session`);
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });

  if (session.status !== "complete" || session.payment_status !== "paid") {
    // soft-landing: let them try again or contact support
    return redirect(`${APP_URL}/?err=payment_incomplete`);
  }

  const meta = session.metadata || {};
  const orderId = meta.orderId!;
  const offer = (meta.offer as "quick" | "deep") || "quick";
  const coachId = meta.coachId!;
  const studentEmail = meta.studentEmail || session.customer_details?.email || "";
  const studentName = meta.studentName || session.customer_details?.name || "";

  // Ensure we have a ReviewOrder row (idempotent)
  await supabaseAdmin.from("review_orders").upsert(
    {
      id: orderId,
      coach_id: coachId,
      student_email: studentEmail,
      student_name: studentName,
      offer_type: offer,
      status: "paid",
      stripe_session_id: session.id,
      stripe_payment_intent: (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null,
    },
    { onConflict: "id" },
  );

  if (offer === "deep") {
    // 1:1 scheduling — build a Cal link prefilled with student details and carry orderId forward.
    const coach = await getCoach(coachId);
    if (!coach.cal_username || !coach.deep_event_slug) {
      // fallback to upload page if coach hasn’t set their Cal event yet
      return redirect(`${KRAV_UPLOAD_URL}?order=${orderId}`);
    }

    // Prefill & lock fields; carry order so Cal forwards it to your success page after booking.
    // (Enable "Redirect to a custom URL after a successful booking" in Cal event type Advanced,
    //  and set it to your upload page; make sure "Forward parameters" is on.)
    const calUrl = `https://cal.com/${encodeURIComponent(coach.cal_username)}/${encodeURIComponent(
      coach.deep_event_slug,
    )}?name=${encodeURIComponent(studentName)}&email=${encodeURIComponent(
      studentEmail,
    )}&disableOnPrefill=true&order=${encodeURIComponent(orderId)}`;

    return redirect(calUrl);
  }

  // Quick review — no scheduling; send them to upload immediately
  return redirect(`${KRAV_UPLOAD_URL}?order=${encodeURIComponent(orderId)}`);
}
