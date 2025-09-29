// app/api/review/create-checkout/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase"; // used to look up coach data

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Configure your platform fee here (e.g., 15% = 0.15) ---
const PLATFORM_FEE_PCT = 0.15 as const;

// Helper: load coach’s Stripe/Cal/pricing from your DB (stub for now)
async function getCoach(coachId: string) {
  // TODO: replace with your actual table/columns
  // Expecting: stripe_account_id, cal_username, deep_event_slug, quick_price_cents, deep_price_cents
  const { data, error } = await supabaseAdmin
    .from("coaches")
    .select("id, name, slug, stripe_account_id, cal_username, deep_event_slug, quick_price_cents, deep_price_cents")
    .eq("id", coachId)
    .single();

  if (error || !data) throw new Error("Coach not found");
  return data as {
    id: string;
    name: string;
    slug: string | null;
    stripe_account_id: string;
    cal_username: string | null;
    deep_event_slug: string | null;
    quick_price_cents: number;
    deep_price_cents: number;
  };
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const APP_URL = process.env.PUBLIC_APP_URL || "https://student-video-repo.vercel.app";
const KRAV_SITE = "https://www.kravtofly.com";

type Body = {
  // From Webflow or your own page
  offer: "quick" | "deep";         // which button they clicked
  coachId: string;                 // the coach they chose
  studentEmail?: string;           // optional prefill
  studentName?: string;            // optional prefill
};

export async function POST(req: NextRequest) {
  try {
    const { offer, coachId, studentEmail, studentName } = (await req.json()) as Body;
    if (!offer || !coachId) {
      return Response.json({ error: "offer and coachId are required" }, { status: 400 });
    }

    const coach = await getCoach(coachId);

    const unitPrice =
      offer === "deep" ? coach.deep_price_cents : coach.quick_price_cents;

    if (!unitPrice || unitPrice < 100) {
      return Response.json({ error: "Coach price not configured" }, { status: 400 });
    }

    if (!coach.stripe_account_id) {
      return Response.json({ error: "Coach is not connected to Stripe" }, { status: 400 });
    }

    // Generate an orderId now and carry it end-to-end
    const orderId = crypto.randomUUID();

    // Calculate platform fee
    const application_fee_amount = Math.round(unitPrice * PLATFORM_FEE_PCT);

    // We'll always return to a small handler page that verifies payment, creates ReviewOrder and redirects
    const successUrl = `${APP_URL}/review/after-checkout?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${KRAV_SITE}/coaches/${coach.slug ?? coach.id}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: studentEmail,
      allow_promotion_codes: true,
      submit_type: "pay",
      payment_intent_data: {
        transfer_data: { destination: coach.stripe_account_id },
        application_fee_amount,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: unitPrice,
            product_data: {
              name: offer === "deep" ? "Deep Dive + 1-on-1" : "Quick Video Review",
              metadata: {
                coachId,
                offer,
              },
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId,
        offer,
        coachId,
        coachName: coach.name ?? "",
        studentName: studentName ?? "",
        studentEmail: studentEmail ?? "",
      },
    });

    return Response.json({ url: session.url, orderId });
  } catch (err: any) {
    console.error("create-checkout error", err?.message || err);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
