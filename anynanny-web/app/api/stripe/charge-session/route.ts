import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { calculateBillingFromSession } from "@/lib/billing/session-calculator";
import { DEFAULT_HOURLY_RATE, SESSIONS_TABLE } from "@/lib/billing/session-types";
import { SITTER_PROFILES_TABLE } from "@/lib/sitter/sitter-profile";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ChargeSessionBody = {
  sessionId?: string;
};

type SessionRow = {
  id: string;
  parent_id: string;
  sitter_id: string;
  status: string;
  payment_status?: string | null;
  paid_at?: string | null;
  hourly_rate?: number | null;
  start_time_confirmed_by_sitter: string | null;
  end_time_confirmed_by_parent: string | null;
  total_minutes?: number | null;
  total_amount?: number | null;
  stripe_payment_intent_id?: string | null;
  booking_id?: string | null;
};

type ProfileRow = {
  id: string;
  stripe_customer_id: string | null;
  default_payment_method_id?: string | null;
};

type ChargeErrorCode =
  | "invalid_json"
  | "missing_session_id"
  | "unauthorized"
  | "forbidden"
  | "session_not_found"
  | "session_incomplete"
  | "already_paid"
  | "missing_stripe_customer"
  | "no_default_payment_method"
  | "zero_amount"
  | "stripe_error"
  | "supabase_error"
  | "card_declined";

function errorResponse(
  code: ChargeErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error: { code, message, ...(extra ?? {}) } }, { status });
}

async function logTransaction(
  admin: ReturnType<typeof getSupabaseServiceRoleClient>,
  payload: {
    sessionId: string;
    parentId: string;
    sitterId: string | null;
    bookingId: string | null;
    stripePaymentIntentId: string;
    amountMinorUnits: number;
    amountNis: number;
    currency: string;
    status: string;
    totalMinutes: number;
    hourlyRate: number;
  }
): Promise<void> {
  /** Best-effort insert — table may not exist on older environments. */
  try {
    const { error } = await admin.from("payment_transactions").insert({
      session_id: payload.sessionId,
      parent_id: payload.parentId,
      sitter_id: payload.sitterId,
      booking_id: payload.bookingId,
      stripe_payment_intent_id: payload.stripePaymentIntentId,
      amount_minor_units: payload.amountMinorUnits,
      amount_nis: payload.amountNis,
      currency: payload.currency,
      status: payload.status,
      total_minutes: payload.totalMinutes,
      hourly_rate: payload.hourlyRate
    });
    if (error) {
      console.warn("[stripe charge-session] transaction log insert failed:", error.message);
    }
  } catch (e) {
    console.warn("[stripe charge-session] transaction log threw:", e instanceof Error ? e.message : e);
  }
}

export async function POST(request: Request) {
  let body: ChargeSessionBody;
  try {
    body = (await request.json()) as ChargeSessionBody;
  } catch {
    return errorResponse("invalid_json", "Invalid JSON body.", 400);
  }

  const sessionId = String(body.sessionId ?? "").trim();
  if (!sessionId) {
    return errorResponse("missing_session_id", "sessionId is required.", 400);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return errorResponse("unauthorized", "Authentication required.", 401);
  }

  const { data: sessionData, error: sessionError } = await supabase
    .from(SESSIONS_TABLE)
    .select(
      "id, parent_id, sitter_id, status, payment_status, paid_at, hourly_rate, start_time_confirmed_by_sitter, end_time_confirmed_by_parent, total_minutes, total_amount, stripe_payment_intent_id, booking_id"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error("[stripe charge-session] session lookup failed:", sessionError.message);
    return errorResponse("supabase_error", "Could not load session.", 500);
  }
  if (!sessionData) {
    return errorResponse("session_not_found", "Session not found.", 404);
  }

  const session = sessionData as SessionRow;

  if (String(session.parent_id) !== user.id) {
    return errorResponse("forbidden", "Only the booking parent may charge this session.", 403);
  }

  if (!session.start_time_confirmed_by_sitter || !session.end_time_confirmed_by_parent) {
    return errorResponse(
      "session_incomplete",
      "Session is not fully confirmed — both start and end timestamps are required before charging.",
      400
    );
  }

  if (session.payment_status === "paid" || session.paid_at || session.stripe_payment_intent_id) {
    return NextResponse.json({
      ok: true,
      alreadyPaid: true,
      paymentIntentId: session.stripe_payment_intent_id ?? null,
      amount: session.total_amount ?? null
    });
  }

  const { data: parentProfileData, error: parentProfileError } = await supabase
    .from("profiles")
    .select("id, stripe_customer_id, default_payment_method_id")
    .eq("id", user.id)
    .maybeSingle();

  if (parentProfileError) {
    console.error("[stripe charge-session] parent profile lookup failed:", parentProfileError.message);
    return errorResponse("supabase_error", "Could not load parent profile.", 500);
  }

  const parentProfile = (parentProfileData as ProfileRow | null) ?? null;
  const stripeCustomerId = parentProfile?.stripe_customer_id?.trim() ?? "";
  if (!stripeCustomerId) {
    return errorResponse(
      "missing_stripe_customer",
      "Parent has no Stripe customer on file. Save a payment method before completing a session.",
      400
    );
  }

  let hourlyRate = Number(session.hourly_rate);
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    const { data: sitterProfile, error: sitterProfileError } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select("hourly_rate_nis")
      .eq("id", session.sitter_id)
      .maybeSingle();
    if (sitterProfileError) {
      console.warn(
        "[stripe charge-session] sitter rate lookup failed; falling back to default:",
        sitterProfileError.message
      );
    }
    const candidate = Number(sitterProfile?.hourly_rate_nis);
    hourlyRate = Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_HOURLY_RATE;
  }

  const { totalMinutes, totalAmount } = calculateBillingFromSession(
    {
      startTimeConfirmedBySitter: session.start_time_confirmed_by_sitter,
      endTimeConfirmedByParent: session.end_time_confirmed_by_parent
    },
    hourlyRate
  );

  if (totalMinutes <= 0 || totalAmount <= 0) {
    return errorResponse(
      "zero_amount",
      "Computed session duration is zero — nothing to charge.",
      400
    );
  }

  const amountMinorUnits = Math.max(50, Math.round(totalAmount * 100));
  const currency = "ils";
  const stripe = getStripe();

  let resolvedPaymentMethodId = parentProfile?.default_payment_method_id?.trim() || "";

  if (!resolvedPaymentMethodId) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      if (!("deleted" in customer) || customer.deleted !== true) {
        const fromInvoice =
          (customer as Stripe.Customer).invoice_settings?.default_payment_method;
        if (typeof fromInvoice === "string") {
          resolvedPaymentMethodId = fromInvoice;
        } else if (fromInvoice && typeof fromInvoice === "object" && "id" in fromInvoice) {
          resolvedPaymentMethodId = (fromInvoice as Stripe.PaymentMethod).id;
        }
      }
    } catch (e) {
      console.warn(
        "[stripe charge-session] customer retrieve failed:",
        e instanceof Error ? e.message : e
      );
    }
  }

  if (!resolvedPaymentMethodId) {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: "card",
        limit: 1
      });
      resolvedPaymentMethodId = paymentMethods.data[0]?.id ?? "";
    } catch (e) {
      console.warn(
        "[stripe charge-session] payment method list failed:",
        e instanceof Error ? e.message : e
      );
    }
  }

  if (!resolvedPaymentMethodId) {
    return errorResponse(
      "no_default_payment_method",
      "Parent has no saved payment method available for off-session charges.",
      400
    );
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amountMinorUnits,
      currency,
      customer: stripeCustomerId,
      payment_method: resolvedPaymentMethodId,
      off_session: true,
      confirm: true,
      description: `AnyNanny session ${session.id}`,
      metadata: {
        anynanny_session_id: session.id,
        parent_id: session.parent_id,
        sitter_id: session.sitter_id ?? "",
        booking_id: session.booking_id ?? "",
        total_minutes: String(totalMinutes),
        hourly_rate: String(hourlyRate)
      }
    });
  } catch (err) {
    const stripeErr = err as Stripe.errors.StripeError & { code?: string };
    const message = stripeErr.message ?? "Stripe error.";
    const code = stripeErr.code === "authentication_required" || stripeErr.code === "card_declined"
      ? "card_declined"
      : "stripe_error";
    console.error("[stripe charge-session] paymentIntents.create failed:", message);
    return errorResponse(code, message, 502, {
      stripeCode: stripeErr.code ?? null,
      declineCode: stripeErr.decline_code ?? null
    });
  }

  if (paymentIntent.status !== "succeeded") {
    console.warn(
      "[stripe charge-session] paymentIntent not succeeded:",
      paymentIntent.id,
      paymentIntent.status
    );
    return errorResponse(
      "stripe_error",
      `Payment requires additional action (status: ${paymentIntent.status}).`,
      402,
      {
        paymentIntentId: paymentIntent.id,
        paymentIntentStatus: paymentIntent.status,
        clientSecret: paymentIntent.client_secret ?? null
      }
    );
  }

  const paidAtIso = new Date().toISOString();
  const admin = getSupabaseServiceRoleClient();

  try {
    const { error: updateError } = await admin
      .from(SESSIONS_TABLE)
      .update({
        payment_status: "paid",
        paid_at: paidAtIso,
        stripe_payment_intent_id: paymentIntent.id,
        total_minutes: totalMinutes,
        total_amount: totalAmount,
        updated_at: paidAtIso
      })
      .eq("id", session.id)
      .eq("parent_id", session.parent_id);

    if (updateError) {
      console.error(
        "[stripe charge-session] session update after charge failed:",
        updateError.message
      );
    }
  } catch (e) {
    console.error(
      "[stripe charge-session] session update threw after charge:",
      e instanceof Error ? e.message : e
    );
  }

  await logTransaction(admin, {
    sessionId: session.id,
    parentId: session.parent_id,
    sitterId: session.sitter_id ?? null,
    bookingId: session.booking_id ?? null,
    stripePaymentIntentId: paymentIntent.id,
    amountMinorUnits,
    amountNis: totalAmount,
    currency,
    status: paymentIntent.status,
    totalMinutes,
    hourlyRate
  });

  return NextResponse.json({
    ok: true,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    amountNis: totalAmount,
    amountMinorUnits,
    totalMinutes,
    hourlyRate,
    paidAt: paidAtIso
  });
}
