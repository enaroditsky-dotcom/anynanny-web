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

const CHECKOUT_CLIENT_TIMEOUT_MS = 45_000;

export async function postParentCheckoutSession(
  body: ParentCheckoutRequest
): Promise<ParentCheckoutResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECKOUT_CLIENT_TIMEOUT_MS);

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
      signal: controller.signal
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
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[postParentCheckoutSession] timed out after", CHECKOUT_CLIENT_TIMEOUT_MS, "ms");
      return {
        ok: false,
        error: "התשלום ארך יותר מדי זמן. נסו שוב.",
        status: 408
      };
    }
    console.error("[postParentCheckoutSession]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Checkout network error.",
      status: 0
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Maps technical checkout errors to parent-friendly Hebrew copy. */
export function formatParentCheckoutError(error: string): string {
  const normalized = error.trim().toLowerCase();
  if (
    normalized.includes("endpoint") ||
    normalized.includes("not found") ||
    normalized.includes("404") ||
    normalized.includes("cardcom") ||
    normalized.includes("gateway") ||
    normalized.includes("hyp") ||
    normalized.includes("timeout") ||
    normalized.includes("ארך יותר")
  ) {
    return "לא ניתן להשלים את התשלום כרגע. נסו שוב בעוד רגע.";
  }
  return error.trim() || "שגיאה בפתיחת התשלום. נסו שוב.";
}
