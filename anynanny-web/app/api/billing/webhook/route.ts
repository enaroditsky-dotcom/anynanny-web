import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BILLING_TRANSACTIONS_TABLE,
  creditParentWalletDeposit
} from "@/lib/wallet/billing-transactions";

export const runtime = "nodejs";

const WALLET_DEPOSIT_PURPOSE = "wallet_deposit" as const;
const DEPOSIT_DESCRIPTION = "טעינת כסף לארנק הדיגיטלי" as const;

function paymentIntentAmountIls(paymentIntent: Stripe.PaymentIntent): number {
  const minorUnits =
    paymentIntent.amount_received > 0 ? paymentIntent.amount_received : paymentIntent.amount;
  return Math.round(minorUnits) / 100;
}

async function handleWalletDeposit(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const userId = paymentIntent.metadata?.supabase_user_id?.trim() ?? "";
  const purpose = paymentIntent.metadata?.purpose?.trim() ?? "";

  if (purpose !== WALLET_DEPOSIT_PURPOSE) {
    return;
  }

  if (!userId) {
    console.warn("[billing webhook] wallet_deposit missing supabase_user_id", paymentIntent.id);
    return;
  }

  const depositAmount = paymentIntentAmountIls(paymentIntent);
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    console.warn("[billing webhook] wallet_deposit invalid amount", paymentIntent.id, depositAmount);
    return;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Database client initialization failed.");
  }

  const { data: existingTxn, error: existingTxnError } = await supabase
    .from(BILLING_TRANSACTIONS_TABLE)
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (existingTxnError) {
    console.error("[billing webhook] transaction lookup failed:", existingTxnError.message);
    throw new Error(existingTxnError.message);
  }

  if (existingTxn) {
    return;
  }

  const credit = await creditParentWalletDeposit(supabase, {
    parentId: userId,
    amount: depositAmount,
    description: DEPOSIT_DESCRIPTION,
    stripePaymentIntentId: paymentIntent.id
  });

  if (credit.error) {
    console.error("[billing webhook] creditParentWalletDeposit failed:", credit.error);
    throw new Error(credit.error);
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[billing webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe webhook error.";
    console.error("[billing webhook] signature verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    try {
      await handleWalletDeposit(event.data.object as Stripe.PaymentIntent);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook handler failed.";
      console.error("[billing webhook] payment_intent.succeeded handler:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}