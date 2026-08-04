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

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, parent_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (String(booking.parent_id) !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

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

  const amountMinorUnits = Number(body.amountMinorUnits);
  const amountNis =
    Number.isFinite(amountMinorUnits) && amountMinorUnits >= 50
      ? amountMinorUnits / 100
      : 50;

  try {
    const hyp = await createHypCheckoutSession({
      bookingId,
      amountNis,
      successUrl,
      paymentMethod: String(body.paymentMethod ?? "credit_card"),
      description: String(body.description ?? "תשלום משמרת AnyNanny"),
      shiftSessionId: body.shiftDetails?.sessionId
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
      status: "pending"
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
