import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";

export type ParentCheckoutRequest = {
  bookingId: string;
  amountMinorUnits: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  paymentMethod?: CheckoutPaymentMethod | string;
  shiftDetails?: {
    sessionId?: string;
    elapsedSeconds?: number;
  };
};

export type ParentCheckoutSuccess = {
  ok: true;
  url: string;
  sessionId: string;
  gateway: string;
  status: string;
  mock: boolean;
  paymentMethod: string;
};

export type ParentCheckoutFailure = {
  ok: false;
  error: string;
  status: number;
};

export type ParentCheckoutResponse = ParentCheckoutSuccess | ParentCheckoutFailure;

export async function postParentCheckoutSession(
  body: ParentCheckoutRequest
): Promise<ParentCheckoutResponse> {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    sessionId?: string;
    gateway?: string;
    status?: string;
    mock?: boolean;
    paymentMethod?: string;
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

  return {
    ok: true,
    url: json.url,
    sessionId: json.sessionId,
    gateway: typeof json.gateway === "string" ? json.gateway : "mock",
    status: typeof json.status === "string" ? json.status : "succeeded",
    mock: json.mock === true,
    paymentMethod: typeof json.paymentMethod === "string" ? json.paymentMethod : "credit_card"
  };
}

/** Maps technical checkout errors to parent-friendly Hebrew copy. */
export function formatParentCheckoutError(error: string): string {
  const normalized = error.trim().toLowerCase();
  if (
    normalized.includes("endpoint") ||
    normalized.includes("not found") ||
    normalized.includes("404") ||
    normalized.includes("cardcom") ||
    normalized.includes("gateway")
  ) {
    return "לא ניתן להשלים את התשלום כרגע. נסו שוב בעוד רגע.";
  }
  return error.trim() || "שגיאה בפתיחת התשלום. נסו שוב.";
}
