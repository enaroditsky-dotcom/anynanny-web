import {
  DEFAULT_CHECKOUT_PAYMENT_METHOD,
  parseCheckoutPaymentMethod
} from "@/lib/billing/checkout-payment-method";
import { resolveCheckoutRedirectUrl } from "@/lib/billing/checkout-redirect-url";
import { createMockCheckoutSession } from "@/lib/billing/mock-checkout";
import { computePlatformFeeFromMinorUnits } from "@/lib/billing/platform-fee";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const PAYABLE_BOOKING_STATUSES = new Set(["completed", "sitter_ended", "parent_started"]);

export type ParentCheckoutBody = {
  amountMinorUnits?: number;
  totalPriceNis?: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  bookingId?: string;
  paymentMethod?: string;
  shiftDetails?: {
    sessionId?: string;
    elapsedSeconds?: number;
  };
};

function resolveAmountMinorUnits(body: ParentCheckoutBody): number | null {
  const fromMinor = Number(body.amountMinorUnits);
  if (Number.isInteger(fromMinor) && fromMinor >= 50) return fromMinor;

  const fromTotal = Number(body.totalPriceNis);
  if (Number.isFinite(fromTotal) && fromTotal > 0) {
    return Math.max(50, Math.round(fromTotal * 100));
  }

  return null;
}

async function recordMockBookingPayment(
  supabase: SupabaseClient,
  bookingId: string,
  paymentMethod: string,
  mockSessionId: string,
  totalNis: number
): Promise<void> {
  const paidAt = new Date().toISOString();
  const { error } = await supabase
    .from("bookings")
    .update({
      payment_status: "paid",
      paid_at: paidAt,
      metadata: {
        gateway: "mock",
        paymentMethod,
        mockSessionId,
        amount_paid: totalNis
      }
    })
    .eq("id", bookingId);

  if (error) {
    console.warn("[checkout] mock booking payment update skipped:", error.message);
  }
}

async function recordMockSessionPayment(
  supabase: SupabaseClient,
  parentId: string,
  shiftSessionId: string,
  totalNis: number
): Promise<void> {
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({
      status: "paid",
      session_status: "paid",
      total_amount_charged: totalNis
    })
    .eq("id", shiftSessionId)
    .eq("parent_id", parentId);

  if (error) {
    console.warn("[checkout] mock session payment update skipped:", error.message);
  }
}

export async function handleParentCheckout(request: Request, supabase: SupabaseClient, user: User) {
  let body: ParentCheckoutBody;
  try {
    body = (await request.json()) as ParentCheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const amountMinorUnits = resolveAmountMinorUnits(body);
  if (amountMinorUnits == null) {
    return NextResponse.json(
      {
        error:
          "Provide amountMinorUnits (integer >= 50) or totalPriceNis (> 0) for the shift payment total."
      },
      { status: 400 }
    );
  }

  const currency = String(body.currency ?? "ils").toLowerCase();
  if (currency !== "ils") {
    return NextResponse.json({ error: "Checkout currently supports ILS only." }, { status: 400 });
  }

  const paymentMethod =
    parseCheckoutPaymentMethod(body.paymentMethod) ??
    (body.paymentMethod != null && String(body.paymentMethod).trim() !== ""
      ? null
      : DEFAULT_CHECKOUT_PAYMENT_METHOD);

  if (!paymentMethod) {
    return NextResponse.json(
      {
        error:
          "Invalid paymentMethod. Supported values: credit_card, bit, paybox, wallet."
      },
      { status: 400 }
    );
  }

  const paymentSplit = computePlatformFeeFromMinorUnits(amountMinorUnits);

  const { data: profile, error: profileErr } = await supabase
    .from(PROFILES_TABLE)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: "Failed to verify account role." }, { status: 500 });
  }

  if (profile?.role !== "parent") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const bookingId = String(body.bookingId ?? "").trim();
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
  }

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, parent_id, status, payment_status, paid_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const row = booking as {
    id: string;
    parent_id: string;
    status: string;
    payment_status?: string | null;
    paid_at?: string | null;
  };

  if (String(row.parent_id) !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!PAYABLE_BOOKING_STATUSES.has(String(row.status))) {
    return NextResponse.json(
      { error: "This booking cannot be paid in its current state." },
      { status: 400 }
    );
  }

  if (row.payment_status === "paid" || row.paid_at) {
    return NextResponse.json({ error: "This booking is already paid." }, { status: 400 });
  }

  let successUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(
      request,
      body.successUrl,
      "/parent/dashboard?checkout=success"
    );
    resolveCheckoutRedirectUrl(request, body.cancelUrl, "/parent/dashboard?checkout=cancel");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const mockSession = createMockCheckoutSession({
    bookingId,
    successUrl,
    paymentMethod,
    paymentSplit,
    shiftDetails: body.shiftDetails
  });

  await recordMockBookingPayment(
    supabase,
    bookingId,
    paymentMethod,
    mockSession.sessionId,
    paymentSplit.totalNis
  );

  const shiftSessionId = body.shiftDetails?.sessionId?.trim();
  if (shiftSessionId) {
    await recordMockSessionPayment(
      supabase,
      user.id,
      shiftSessionId,
      paymentSplit.totalNis
    );
  }

  console.info("[checkout] mock session created", {
    bookingId,
    sessionId: mockSession.sessionId,
    paymentMethod,
    totalNis: paymentSplit.totalNis,
    platformFeeNis: paymentSplit.platformFeeNis
  });

  return NextResponse.json(mockSession);
}
