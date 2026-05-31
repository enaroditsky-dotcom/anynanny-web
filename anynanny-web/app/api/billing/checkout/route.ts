import { computeSessionChargeFromShakes } from "@/lib/stripe/compute-session-charge";
import { getStripe } from "@/lib/stripe/server";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CheckoutBody = {
  sessionId?: string;
};

function shakeSet(value: unknown): boolean {
  return value != null && String(value).trim() !== "";
}

/** Creates a PaymentIntent for parent checkout while sitter_end is set and parent_end is still NULL. */
export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from(SESSIONS_TABLE)
    .select(
      "id, parent_id, sitter_id, booking_id, parent_start_shake, sitter_end_shake, parent_end_shake, sitter_start_shake, billing_rate_per_minute, stripe_payment_intent_id, session_status, total_amount_charged"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const row = session as {
    id: string;
    parent_id: string;
    sitter_id: string | null;
    booking_id: string | null;
    parent_start_shake: string | null;
    sitter_end_shake: string | null;
    parent_end_shake: string | null;
    sitter_start_shake: string | null;
    billing_rate_per_minute: number | null;
    stripe_payment_intent_id: string | null;
    session_status: string | null;
    total_amount_charged: number | null;
  };

  if (String(row.parent_id) !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (
    !shakeSet(row.sitter_start_shake) ||
    !shakeSet(row.parent_start_shake) ||
    !shakeSet(row.sitter_end_shake)
  ) {
    return NextResponse.json(
      { error: "Session is not ready for checkout — start shakes and sitter end are required." },
      { status: 400 }
    );
  }

  const normalizedStatus = row.session_status?.trim().toLowerCase() ?? "";
  if (normalizedStatus !== "completed" && normalizedStatus !== "paid") {
    return NextResponse.json(
      { error: "Session is not ready for checkout — parent must confirm end first." },
      { status: 400 }
    );
  }

  if (!shakeSet(row.parent_end_shake)) {
    return NextResponse.json(
      { error: "Session is not ready for checkout — parent end confirmation is required." },
      { status: 400 }
    );
  }

  if (row.session_status === "paid") {
    return NextResponse.json({
      alreadyPaid: true,
      paymentIntentId: row.stripe_payment_intent_id,
      amount: row.total_amount_charged ?? undefined
    });
  }

  if (row.stripe_payment_intent_id) {
    const stripe = getStripe();
    const existing = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id!);
    if (existing.status === "succeeded") {
      return NextResponse.json({
        alreadyPaid: true,
        paymentIntentId: existing.id,
        amount: row.total_amount_charged ?? undefined
      });
    }
    return NextResponse.json({
      clientSecret: existing.client_secret,
      paymentIntentId: existing.id,
      amount: row.total_amount_charged ?? undefined,
      amountMinorUnits: existing.amount,
      elapsedSeconds: computeSessionChargeFromShakes(row)?.elapsedSeconds
    });
  }

  const charge = computeSessionChargeFromShakes(row);
  if (!charge) {
    return NextResponse.json(
      { error: "Cannot compute charge — missing parent_start_shake or sitter_end_shake." },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: charge.amountMinorUnits,
      currency: "ils",
      metadata: {
        anynanny_session_id: sessionId,
        parent_id: row.parent_id,
        sitter_id: row.sitter_id ?? "",
        booking_id: row.booking_id ?? "",
        total_minutes: String(charge.totalMinutes),
        elapsed_seconds: String(charge.elapsedSeconds)
      },
      automatic_payment_methods: { enabled: true }
    });

    await supabase
      .from(SESSIONS_TABLE)
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        total_amount_charged: charge.amountNis
      })
      .eq("id", sessionId)
      .eq("parent_id", user.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: charge.amountNis,
      amountMinorUnits: charge.amountMinorUnits,
      elapsedSeconds: charge.elapsedSeconds
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error.";
    console.error("[billing checkout]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
