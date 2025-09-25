// app/api/stripe/webhook/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_REVIEW!;

// Match the SDK's accepted version union for TS
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

// Stripe needs the RAW body for signature verification
export async function POST(req: NextRequest) {
  let event: Stripe.Event;

  try {
    const raw = await req.text();
    const sig = req.headers.get("stripe-signature") || "";
    event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("stripe webhook verify failed:", err?.message || err);
    return new NextResponse("Bad signature", { status: 400 });
  }

  try {
    // 1) Payment completed -> mark order as paid
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const reviewOrderId = session.metadata?.review_order_id;
      if (reviewOrderId) {
        await supabaseAdmin
          .from("review_orders")
          .update({
            status: "paid",
            stripe_payment_intent_id:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent as any)?.id ?? null,
          })
          .eq("id", reviewOrderId);
      }
    }

    // 2) Checkout expired -> mark order cancelled
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const reviewOrderId = session.metadata?.review_order_id;
      if (reviewOrderId) {
        await supabaseAdmin
          .from("review_orders")
          .update({ status: "cancelled" })
          .eq("id", reviewOrderId);
      }
    }

    // 3) Refund created (full or partial) -> mark order refunded
    if (event.type === "refund.created") {
      const refund = event.data.object as Stripe.Refund;
      const pi =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : (refund.payment_intent as any)?.id ?? null;

      if (pi) {
        await supabaseAdmin
          .from("review_orders")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent_id", pi);
      }
    }

    // (Optional legacy/fallback) charge.refunded
    if (event.type === "charge.refunded") {
      const ch = event.data.object as Stripe.Charge;
      const pi =
        typeof ch.payment_intent === "string"
          ? ch.payment_intent
          : (ch.payment_intent as any)?.id ?? null;

      if (pi) {
        await supabaseAdmin
          .from("review_orders")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent_id", pi);
      }
    }

    return new NextResponse("ok", { status: 200 });
  } catch (err: any) {
    console.error("stripe webhook handler error:", err?.message || err);
    // Return 200 to avoid repeated retries; errors are logged.
    return new NextResponse("ok", { status: 200 });
  }
}
