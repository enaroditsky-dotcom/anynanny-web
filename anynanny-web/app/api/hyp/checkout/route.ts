import { computeAuthoritativeShiftCharge } from "@/lib/billing/compute-shift-charge";
import { createHypCheckoutSession } from "@/lib/billing/hyp-checkout";
import { resolveCheckoutRedirectUrl } from "@/lib/stripe/redirect-url";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CheckoutBody = {
  amountMinorUnits?: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  bookingId?: string;
  paymentMethod?: string;
  shiftDetails?: { sessionId?: string; elapsedSeconds?: number };
};

/**
 * Hyp checkout entrypoint — creates a hosted Hyp sandbox payment when HYP_* is configured.
 * Amount is derived from booking/session DB fields; browser amountMinorUnits is ignored.
 * Does not mark the session paid; finalization happens on Hyp success (complete API / webhook).
 */
export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server client initialization failed." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const bookingId = String(body.bookingId ?? "").trim();
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
  }

  const chargeResult = await computeAuthoritativeShiftCharge(supabase, user.id, {
    bookingId,
    sessionId: body.shiftDetails?.sessionId
  });

  if (!chargeResult.ok) {
    return NextResponse.json({ error: chargeResult.error }, { status: chargeResult.status });
  }

  const charge = chargeResult.charge;

  let successUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(
      request,
      body.successUrl,
      "/parent/checkout/complete?checkout=success"
    );
  } catch {
    successUrl = "/parent/checkout/complete?checkout=success";
  }

  try {
    const hyp = await createHypCheckoutSession({
      bookingId,
      amountNis: charge.amountMinorUnits / 100,
      successUrl,
      paymentMethod: String(body.paymentMethod ?? "credit_card"),
      description: String(body.description ?? "תשלום משמרת AnyNanny"),
      shiftSessionId: charge.sessionId
    });

    await supabase
      .from("bookings")
      .update({
        payment_status: "pending_checkout"
      })
      .eq("id", bookingId);

    return NextResponse.json({
      url: hyp.checkoutUrl,
      sessionId: hyp.sessionId,
      gateway: "hyp",
      mock: false,
      status: "pending",
      amountMinorUnits: charge.amountMinorUnits,
      totalNis: charge.parentTotalNis,
      sitterBaseNis: charge.sitterBaseNis,
      shiftSessionId: charge.sessionId
    });
  } catch (error) {
    console.error("[hyp/checkout] Hyp unavailable:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Hyp payment initiation failed. Check HYP_* environment variables."
      },
      { status: 502 }
    );
  }
}
