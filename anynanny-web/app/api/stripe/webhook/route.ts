import { computeSessionChargeFromShakes } from "@/lib/stripe/compute-session-charge";
import { getStripe } from "@/lib/stripe/server";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe webhook] signature verification failed:", msg);
    return new NextResponse(`Webhook Error: ${msg}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    try {
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[stripe webhook] checkout.session.completed handler:", msg);
      return new NextResponse("Webhook handler failed", { status: 500 });
    }
  }

  if (event.type === "payment_intent.succeeded") {
    try {
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[stripe webhook] payment_intent.succeeded handler:", msg);
      return new NextResponse("Webhook handler failed", { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") {
    return;
  }

  const bookingId = session.metadata?.booking_id?.trim();
  const userId = session.metadata?.supabase_user_id?.trim();
  if (!bookingId || !userId) {
    console.warn("[stripe webhook] missing booking_id or supabase_user_id on session", session.id);
    return;
  }

  const admin = getSupabaseServiceRoleClient();

  const { data: booking, error: readErr } = await admin
    .from("bookings")
    .select("id, parent_id, paid_at, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (readErr) {
    throw new Error(readErr.message);
  }

  if (!booking || String(booking.parent_id) !== userId) {
    console.warn("[stripe webhook] booking not found or parent mismatch", { bookingId, userId });
    return;
  }

  const row = booking as {
    id: string;
    parent_id: string;
    paid_at?: string | null;
    payment_status?: string | null;
  };

  if (row.paid_at || row.payment_status === "paid") {
    return;
  }

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("bookings")
    .update({
      payment_status: "paid",
      paid_at: now,
      stripe_checkout_session_id: session.id,
      updated_at: now
    })
    .eq("id", bookingId)
    .eq("parent_id", userId);

  if (upErr) {
    throw new Error(upErr.message);
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  if (paymentIntent.status !== "succeeded") {
    return;
  }

  const sessionId = paymentIntent.metadata?.anynanny_session_id?.trim();
  const parentId = paymentIntent.metadata?.parent_id?.trim();
  if (!sessionId || !parentId) {
    console.warn("[stripe webhook] missing anynanny_session_id or parent_id on PaymentIntent", paymentIntent.id);
    return;
  }

  const admin = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();

  const { data: sessionRow, error: readErr } = await admin
    .from(SESSIONS_TABLE)
    .select(
      "id, parent_id, session_status, stripe_payment_intent_id, booking_id, parent_start_shake, sitter_end_shake, parent_end_shake, billing_rate_per_minute"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (readErr) {
    throw new Error(readErr.message);
  }

  if (!sessionRow || String(sessionRow.parent_id) !== parentId) {
    console.warn("[stripe webhook] session not found or parent mismatch", { sessionId, parentId });
    return;
  }

  if (sessionRow.session_status === "paid" && sessionRow.parent_end_shake) {
    return;
  }

  const amountNis =
    paymentIntent.amount_received > 0
      ? Math.round(paymentIntent.amount_received) / 100
      : paymentIntent.amount / 100;

  const charge = computeSessionChargeFromShakes(sessionRow as Parameters<typeof computeSessionChargeFromShakes>[0]);
  const elapsedSeconds = charge?.elapsedSeconds ?? Number(paymentIntent.metadata?.elapsed_seconds ?? 0);

  const { error: sessionUpErr } = await admin
    .from(SESSIONS_TABLE)
    .update({
      parent_end_shake: now,
      end_time: now,
      status: "completed",
      session_status: "paid",
      stripe_payment_intent_id: paymentIntent.id,
      total_amount_charged: amountNis,
      final_elapsed_seconds: elapsedSeconds,
      final_amount_nis: amountNis
    })
    .eq("id", sessionId)
    .eq("parent_id", parentId);

  if (sessionUpErr) {
    throw new Error(sessionUpErr.message);
  }

  const bookingId = paymentIntent.metadata?.booking_id?.trim();
  if (bookingId) {
    const { error: bookingUpErr } = await admin
      .from("bookings")
      .update({
        payment_status: "paid",
        paid_at: now,
        updated_at: now
      })
      .eq("id", bookingId)
      .eq("parent_id", parentId);

    if (bookingUpErr) {
      throw new Error(bookingUpErr.message);
    }
  }
}
