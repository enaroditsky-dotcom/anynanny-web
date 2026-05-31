export type PaymentIntentRequest = {
  sessionId: string;
};

export type PaymentIntentResponse =
  | {
      ok: true;
      alreadyPaid?: boolean;
      clientSecret?: string | null;
      paymentIntentId?: string | null;
      amount?: number;
      amountMinorUnits?: number;
      elapsedSeconds?: number;
    }
  | { ok: false; error: string; status: number };

export async function postStripePaymentIntent(
  body: PaymentIntentRequest
): Promise<PaymentIntentResponse> {
  const res = await fetch("/api/stripe/payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    alreadyPaid?: boolean;
    clientSecret?: string | null;
    paymentIntentId?: string | null;
    amount?: number;
    amountMinorUnits?: number;
    elapsedSeconds?: number;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : "Payment intent failed.",
      status: res.status
    };
  }

  return {
    ok: true,
    alreadyPaid: json.alreadyPaid,
    clientSecret: json.clientSecret,
    paymentIntentId: json.paymentIntentId,
    amount: json.amount,
    amountMinorUnits: json.amountMinorUnits,
    elapsedSeconds: json.elapsedSeconds
  };
}
