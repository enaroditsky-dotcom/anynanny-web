import {
  DEFAULT_CHECKOUT_PAYMENT_METHOD,
  parseCheckoutPaymentMethod
} from "@/lib/billing/checkout-payment-method";
import { resolveCheckoutRedirectUrl } from "@/lib/billing/checkout-redirect-url";
import { createHypCheckoutSession } from "@/lib/billing/hyp-checkout";
import { isHypConfigured } from "@/lib/billing/hyp/create-transaction";
import {
  hypPaymentMethodDescription,
  validateHypWalletAmount
} from "@/lib/billing/hyp/payment-method-flags";
import { chargeHypSavedToken } from "@/lib/billing/hyp/token";
import { finalizeHypPaymentSuccess } from "@/lib/billing/finalize-hyp-payment";
import { computeAuthoritativeShiftCharge } from "@/lib/billing/compute-shift-charge";
import { hypAmountToMinorUnits } from "@/lib/billing/hyp/payment-authority";
import { isHypCapturedChargeCCode } from "@/lib/billing/hyp/parse-return-params";
import { computePlatformFeeFromParentTotal } from "@/lib/billing/platform-fee";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
/** Server-safe — do not import SESSIONS_TABLE from `lib/session/protocol` (`"use client"`). */
import { SESSIONS_TABLE } from "@/lib/billing/session-types";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { getParentPaymentMethodSecret } from "@/lib/wallet/parent-payment-methods";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function assertRelation(name: string, label: string): string {
  const relation = String(name ?? "").trim();
  if (!relation) {
    throw new Error(`[checkout] Missing Supabase relation name for ${label}.`);
  }
  return relation;
}

export type ParentCheckoutBody = {
  /** Ignored. Amount is derived server-side from booking/session DB fields. */
  amountMinorUnits?: number;
  /** Ignored. Amount is derived server-side from booking/session DB fields. */
  totalPriceNis?: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  bookingId?: string;
  paymentMethod?: string;
  /** Saved Hyp card from parent_payment_methods — charges via action=soft. */
  paymentMethodId?: string;
  shiftDetails?: {
    sessionId?: string;
  };
};

async function markBookingPendingCheckout(
  supabase: SupabaseClient,
  bookingId: string
): Promise<void> {
  const { error } = await supabase
    .from(assertRelation(BOOKINGS_TABLE, "bookings"))
    .update({
      payment_status: "pending_checkout"
    })
    .eq("id", bookingId);

  if (error) {
    console.warn("[checkout] pending_checkout update skipped:", error.message);
  }
}

export async function handleParentCheckout(request: Request, supabase: SupabaseClient, user: User) {
  let body: ParentCheckoutBody;
  try {
    body = (await request.json()) as ParentCheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
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

  const { data: profile, error: profileErr } = await supabase
    .from(assertRelation(PROFILES_TABLE, "profiles"))
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

  const requestedSessionId = body.shiftDetails?.sessionId?.trim() || null;
  const chargeResult = await computeAuthoritativeShiftCharge(supabase, user.id, {
    bookingId,
    sessionId: requestedSessionId
  });

  if (!chargeResult.ok) {
    return NextResponse.json({ error: chargeResult.error }, { status: chargeResult.status });
  }

  const charge = chargeResult.charge;
  const paymentSplit = computePlatformFeeFromParentTotal(charge.parentTotalNis);
  const shiftSessionId = charge.sessionId;

  const { data: booking, error: bookingErr } = await supabase
    .from(assertRelation(BOOKINGS_TABLE, "bookings"))
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

  if (row.payment_status === "paid" || row.paid_at) {
    return NextResponse.json({ error: "This booking is already paid." }, { status: 400 });
  }

  if (!isHypConfigured()) {
    return NextResponse.json(
      {
        error:
          "Hyp is not configured. Set HYP_MASOF (or HYP_TERMINAL_ID), HYP_API_KEY, HYP_PASSP, and HYP_USER.",
        gateway: "hyp"
      },
      { status: 503 }
    );
  }

  let successUrl: string;
  let cancelUrl: string;
  try {
    // Identity-only query params — not proof of payment. Finalization still
    // requires a verified HYP success (CCode) on the complete page / API.
    successUrl = resolveCheckoutRedirectUrl(
      request,
      body.successUrl,
      "/parent/checkout/complete?checkout=success"
    );
    cancelUrl = resolveCheckoutRedirectUrl(
      request,
      body.cancelUrl,
      "/parent/checkout/complete?checkout=cancel"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const successReturn = new URL(successUrl);
  successReturn.searchParams.set("bookingId", bookingId);
  if (shiftSessionId) {
    successReturn.searchParams.set("shiftSessionId", shiftSessionId);
  }
  successUrl = successReturn.toString();

  const cancelReturn = new URL(cancelUrl);
  cancelReturn.searchParams.set("bookingId", bookingId);
  cancelUrl = cancelReturn.toString();

  const paymentMethodId = String(body.paymentMethodId ?? "").trim();

  // Charge a previously saved Hyp card (no hosted pay page).
  // Never apply a saved-card charge when the parent explicitly chose Bit / PayBox.
  if (paymentMethodId && paymentMethod === "credit_card") {
    const secret = await getParentPaymentMethodSecret(supabase, user.id, paymentMethodId);
    if (secret.error || !secret.method) {
      return NextResponse.json(
        { error: secret.error || "Saved payment method not found." },
        { status: 400 }
      );
    }

    try {
      const hypCharge = await chargeHypSavedToken({
        amountNis: charge.amountMinorUnits / 100,
        token: secret.method.hyp_token,
        expMonth: secret.method.exp_month,
        expYear: secret.method.exp_year,
        info: bookingId,
        moreData: shiftSessionId ? `Session_${shiftSessionId}` : null,
        userId: secret.method.israeli_id,
        clientName: user.user_metadata?.first_name ?? "Parent",
        description: String(body.description ?? "תשלום משמרת AnyNanny")
      });

      if (!isHypCapturedChargeCCode(hypCharge.cCode) || !hypCharge.success) {
        return NextResponse.json(
          {
            error: hypCharge.error || "חיוב הכרטיס השמור נכשל. נסו כרטיס אחר או תשלום חדש.",
            gateway: "hyp",
            cCode: hypCharge.cCode ?? null
          },
          { status: 402 }
        );
      }

      const softTransId = String(hypCharge.approvalId ?? "").trim();
      if (!softTransId || softTransId === "0") {
        return NextResponse.json(
          { error: "Hyp soft charge did not return a transaction Id.", gateway: "hyp" },
          { status: 402 }
        );
      }

      const verifiedMinor = hypAmountToMinorUnits(hypCharge.amount);
      if (verifiedMinor == null || verifiedMinor !== charge.amountMinorUnits) {
        return NextResponse.json(
          {
            error: "Hyp charged amount does not match the authoritative shift charge.",
            gateway: "hyp"
          },
          { status: 402 }
        );
      }

      await markBookingPendingCheckout(supabase, bookingId);

      const verifiedAmountNis = Number((verifiedMinor / 100).toFixed(2));
      const finalized = await finalizeHypPaymentSuccess(supabase, {
        bookingId,
        sessionId: shiftSessionId,
        parentId: user.id,
        hypTransId: softTransId,
        verifiedAmountNis
      });

      if (!finalized.ok) {
        return NextResponse.json(
          { error: finalized.error || "החיוב עבר אך שמירת הסטטוס נכשלה." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        sessionId: hypCharge.approvalId,
        url: null,
        status: "paid",
        gateway: "hyp",
        mock: false,
        paymentMethod: "credit_card",
        paymentMethodId,
        amountMinorUnits: charge.amountMinorUnits,
        platformFeeMinorUnits: paymentSplit.platformFeeMinorUnits,
        platformFeeNis: paymentSplit.platformFeeNis,
        sitterBaseNis: charge.sitterBaseNis,
        totalNis: charge.parentTotalNis,
        shiftSessionId: shiftSessionId ?? null,
        paid: true
      });
    } catch (error) {
      console.error("[checkout] saved-card charge failed:", error);
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Saved card charge failed."
        },
        { status: 502 }
      );
    }
  }

  try {
    const amountGuard = validateHypWalletAmount(paymentMethod, charge.amountMinorUnits / 100);
    if (amountGuard) {
      return NextResponse.json({ error: amountGuard }, { status: 400 });
    }

    const hyp = await createHypCheckoutSession({
      bookingId,
      amountNis: charge.amountMinorUnits / 100,
      successUrl,
      cancelUrl,
      paymentMethod,
      description: String(
        body.description ?? hypPaymentMethodDescription(paymentMethod, "checkout")
      ),
      shiftSessionId
    });

    if (!hyp.checkoutUrl?.trim()) {
      throw new Error("Hyp returned an empty checkout URL.");
    }

    await markBookingPendingCheckout(supabase, bookingId);

    // Keep session in payment_pending until Hyp sandbox confirms success.
    if (shiftSessionId) {
      const { error: sessionPendingErr } = await supabase
        .from(assertRelation(SESSIONS_TABLE, "sessions"))
        .update({ status: "payment_pending" })
        .eq("id", shiftSessionId)
        .eq("parent_id", user.id)
        .neq("status", "paid");
      if (sessionPendingErr) {
        console.warn("[checkout] session payment_pending sync:", sessionPendingErr.message);
      }
    }

    console.info("[checkout] Hyp sandbox session created", {
      bookingId,
      sessionId: hyp.sessionId,
      paymentMethod,
      totalNis: charge.parentTotalNis
    });

    return NextResponse.json({
      sessionId: hyp.sessionId,
      url: hyp.checkoutUrl,
      status: "pending",
      gateway: "hyp",
      mock: false,
      paymentMethod,
      amountMinorUnits: charge.amountMinorUnits,
      platformFeeMinorUnits: paymentSplit.platformFeeMinorUnits,
      platformFeeNis: paymentSplit.platformFeeNis,
      sitterBaseNis: charge.sitterBaseNis,
      totalNis: charge.parentTotalNis,
      shiftSessionId: shiftSessionId ?? null
    });
  } catch (hypError) {
    console.error("[checkout] Hyp initiation failed (no mock fallback):", hypError);
    const message =
      hypError instanceof Error
        ? hypError.message
        : "Hyp payment initiation failed. Check HYP_* environment variables.";
    return NextResponse.json({ error: message, gateway: "hyp", mock: false }, { status: 502 });
  }
}
