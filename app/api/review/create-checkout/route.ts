// app/api/review/create-checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe SDK pinned to a TS-accepted version string
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const APP_URL = process.env.PUBLIC_APP_URL || "https://student-video-repo.vercel.app";

type Body = {
  studentEmail: string;
  studentName?: string;

  coachId: string;
  coachName?: string;
  coachEmail?: string;

  currency?: "usd";
  unitPriceCents: number; // per-video price (snapshot)
  numVideos: number;

  oneOnOne?: boolean;
  oneOnOnePriceCents?: number;

  publicDefault?: boolean; // default publish to library
  termsAccepted?: boolean;
  termsVersion?: string;
};

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Body;

    if (!b.studentEmail || !b.coachId || !b.unitPriceCents || !b.numVideos) {
      return NextResponse.json({ error: "missing required fields" }, { status: 400 });
    }

    const currency = b.currency || "usd";
    const oneOnOne = !!b.oneOnOne;

    // 1) Create the order row
    const { data: order, error } = await supabaseAdmin
      .from("review_orders")
      .insert({
        student_email: b.studentEmail,
        student_name: b.studentName ?? null,
        coach_id: b.coachId,
        coach_name: b.coachName ?? null,
        coach_email: b.coachEmail ?? null,
        currency,
        unit_price_cents: b.unitPriceCents,
        num_videos: b.numVideos,
        one_on_one: oneOnOne,
        one_on_one_price_cents: oneOnOne ? (b.oneOnOnePriceCents ?? 0) : null,
        status: "checkout_pending",
        public_default: b.publicDefault ?? true,
        terms_version: b.termsVersion ?? null,
        terms_accepted_at: b.termsAccepted ? new Date().toISOString() : null,
      })
      .select("*")
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message || "db insert failed" }, { status: 500 });
    }

    // 2) Build Checkout Session
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: b.numVideos,
        price_data: {
          currency,
          unit_amount: b.unitPriceCents,
          product_data: {
            name: `Video Review by ${b.coachName || "Coach"}`,
            description: `Personalized feedback (${b.numVideos} video${b.numVideos > 1 ? "s" : ""})`,
            metadata: { coach_id: b.coachId },
          },
        },
      },
    ];

    if (oneOnOne && (b.oneOnOnePriceCents || 0) > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: b.oneOnOnePriceCents!,
          product_data: {
            name: "One-on-One Debrief",
            description: "Live video call with your coach",
            metadata: { coach_id: b.coachId },
          },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: b.studentEmail,
      line_items,
      metadata: {
        review_order_id: order.id,
      },
      success_url: `${APP_URL}/review/upload?token=${order.upload_token.toString()}`,
      cancel_url: `${APP_URL}/review/cancelled`,
    });

    // 3) Save session id
    await supabaseAdmin
      .from("review_orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id);

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    console.error("create-checkout error:", e?.message || e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
