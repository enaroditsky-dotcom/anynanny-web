"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type BillingInlineCheckoutProps = {
  clientSecret: string;
  amountNis: number;
  onSuccess: () => void;
  onError: (message: string) => void;
};

function CheckoutForm({ amountNis, onSuccess, onError }: Omit<BillingInlineCheckoutProps, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setBusy(true);
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required"
    });

    if (error) {
      onError(error.message ?? "התשלום נכשל.");
      setBusy(false);
      return;
    }

    onSuccess();
    setBusy(false);
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3 rounded-2xl border border-navy-header/10 bg-white p-4">
      <p className="text-right text-xs font-semibold text-navy-800/70">
        סה״כ לחיוב: <span className="tabular-nums">₪{amountNis.toFixed(2)}</span>
      </p>
      <PaymentElement options={{ layout: "tabs" }} />
      <button
        type="submit"
        disabled={!stripe || !elements || busy}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? "מעבד תשלום…" : "אישור תשלום"}
      </button>
    </form>
  );
}

export function BillingInlineCheckout({ clientSecret, amountNis, onSuccess, onError }: BillingInlineCheckoutProps) {
  if (!stripePromise) {
    return (
      <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm font-semibold text-rose-800">
        Stripe לא מוגדר (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm amountNis={amountNis} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
