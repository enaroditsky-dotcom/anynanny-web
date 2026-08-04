export type StripeCheckoutRequest = {
  bookingId: string;
  amountMinorUnits: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
};

export type StripeCheckoutResponse =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; error: string; status: number };

export async function postStripeCheckoutSession(
  body: StripeCheckoutRequest
): Promise<StripeCheckoutResponse> {
  const res = await fetch("/api/hyp/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    sessionId?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : "Checkout failed.",
      status: res.status
    };
  }

  if (!json.url || !json.sessionId) {
    return { ok: false, error: "Invalid checkout response.", status: 502 };
  }

  return { ok: true, url: json.url, sessionId: json.sessionId };
}
