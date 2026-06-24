import { NextResponse } from "next/server";

import { resolveCheckoutRedirectUrl } from "@/lib/stripe/redirect-url";
import { resolveParentStripeCustomerId } from "@/lib/stripe/parent-stripe-customer";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MIN_DEPOSIT_MINOR_UNITS = 1000;

type DepositBody = {
  amountMinorUnits?: number;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
};

/** Creates a Stripe Checkout session to top up the parent wallet balance. */
export async function POST(request: Request) {
  let body: DepositBody;
  try {
    body = (await request.json()) as DepositBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const amountMinorUnits = Number(body.amountMinorUnits);
  if (!Number.isInteger(amountMinorUnits) || amountMinorUnits < MIN_DEPOSIT_MINOR_UNITS) {
    return NextResponse.json(
      {
        error: `amountMinorUnits must be an integer of at least ${MIN_DEPOSIT_MINOR_UNITS} (e.g. agorot for ILS).`
      },
      { status: 400 }
    );
  }

  const currency = String(body.currency ?? "ils").toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    return NextResponse.json({ error: "currency must be a 3-letter ISO code." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient(request);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let successUrl: string;
  let cancelUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(request, body.successUrl, "/parent/wallet?deposit=success");
    cancelUrl = resolveCheckoutRedirectUrl(request, body.cancelUrl, "/parent/wallet?deposit=cancel");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { stripeCustomerId, error: customerError } = await resolveParentStripeCustomerId(
    user,
    supabase,
    "billing deposit"
  );

  if (!stripeCustomerId) {
    return NextResponse.json({ error: customerError ?? "Could not create Stripe customer." }, { status: 502 });
  }

  const amountNis = (amountMinorUnits / 100).toFixed(2);

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        supabase_user_id: user.id,
        purpose: "wallet_deposit",
        amount_minor_units: String(amountMinorUnits),
        amount_nis: amountNis
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          purpose: "wallet_deposit",
          amount_minor_units: String(amountMinorUnits),
          amount_nis: amountNis
        }
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinorUnits,
            product_data: {
              name: "טעינת ארנק AnyNanny",
              description: `הטענת ₪${amountNis} לארנק הדיגיטלי`
            }
          }
        }
      ]
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe checkout URL missing." }, { status: 502 });
    }

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      amountMinorUnits,
      amountNis: Number(amountNis)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error.";
    console.error("[billing deposit] checkout session failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
