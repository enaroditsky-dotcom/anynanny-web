import { NextResponse } from "next/server";

import { resolveCheckoutRedirectUrl } from "@/lib/stripe/redirect-url";
import { resolveParentStripeCustomerId } from "@/lib/stripe/parent-stripe-customer";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PortalBody = {
  returnUrl?: string;
};

/** Opens Stripe Customer Portal so parents can manage saved payment methods. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient(request);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: PortalBody = {};
  try {
    const raw = await request.text();
    if (raw.trim()) {
      body = JSON.parse(raw) as PortalBody;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let returnUrl: string;
  try {
    returnUrl = resolveCheckoutRedirectUrl(request, body.returnUrl, "/parent/wallet");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { stripeCustomerId, error: customerError } = await resolveParentStripeCustomerId(
    user,
    supabase,
    "billing stripe-portal"
  );

  if (!stripeCustomerId) {
    return NextResponse.json({ error: customerError ?? "Could not create Stripe customer." }, { status: 502 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe portal URL missing." }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error.";
    console.error("[billing stripe-portal] portal session failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
