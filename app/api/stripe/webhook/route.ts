// app/api/stripe/webhook/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_REVIEW!;

// Stripe needs the raw body
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const reviewOrderId = session.metadata?.review_order_id;
      if (reviewOrderId) {
        await supabaseAdmin
          .from("review_orders")
          .update({
            status: "paid",
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as any)?.id ?? null,
          })
          .eq("id", reviewOrderId);
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const reviewOrderId = session.metadata?.review_order_id;
      if (reviewOrderId) {
        await supabaseAdmin.from("review_orders").update({ status: "cancelled" }).eq("id", reviewOrderId);
      }
    }

    if (event.type === "charge.refunded" || event.type === "payment_intent.partially_refunded") {
      const pi = (event.data.object as any)?.payment_intent?.id || (event.data.object as any)?.id;
      if (pi) {
        await supabaseAdmin.from("review_orders").update({ status: "refunded" }).eq("stripe_payment_intent_id", pi);
      }
    }

    return new NextResponse("ok", { status: 200 });
  } catch (err: any) {
    console.error("stripe webhook error:", err?.message || err);
    return new NextResponse("ok", { status: 200 }); // avoid retries; logs capture issues
  }
}
