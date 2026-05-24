import { resolveCheckoutRedirectUrl } from "@/lib/stripe/redirect-url";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CheckoutBody = {
  amountMinorUnits?: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
  bookingId?: string;
};

/** After shift work or wrap-up — not for unpaid future slots. */
const PAYABLE_BOOKING_STATUSES = new Set(["completed", "sitter_ended", "parent_started"]);

export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const amountMinorUnits = Number(body.amountMinorUnits);
  if (!Number.isInteger(amountMinorUnits) || amountMinorUnits < 50) {
    return NextResponse.json(
      { error: "amountMinorUnits must be an integer of at least 50 (e.g. agorot for ILS)." },
      { status: 400 }
    );
  }

  const currency = String(body.currency ?? "ils").toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    return NextResponse.json({ error: "currency must be a 3-letter ISO code." }, { status: 400 });
  }

  const description = String(body.description ?? "AnyNanny booking payment").slice(0, 500);

  const supabase = await createSupabaseServerClient();
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
  let cancelUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(
      request,
      body.successUrl,
      "/parent/dashboard?checkout=success"
    );
    cancelUrl = resolveCheckoutRedirectUrl(request, body.cancelUrl, "/parent/dashboard?checkout=cancel");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const metadata: Record<string, string> = {
    supabase_user_id: user.id,
    booking_id: bookingId,
    ...(body.metadata ?? {})
  };

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinorUnits,
            product_data: {
              name: description
            }
          }
        }
      ]
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
