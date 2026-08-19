import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";

export type ParentCheckoutRequest = {
  bookingId: string;
  /** Ignored by the server. Kept optional for older clients. */
  amountMinorUnits?: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  paymentMethod?: CheckoutPaymentMethod | string;
  paymentMethodId?: string;
  shiftDetails?: {
    sessionId?: string;
  };
};

export type ParentCheckoutSuccess = {
  ok: true;
  url: string | null;
  sessionId: string;
  gateway: string;
  status: string;
  mock: boolean;
  paymentMethod: string;
  paid?: boolean;
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
      url?: string | null;
      sessionId?: string;
      gateway?: string;
      status?: string;
      mock?: boolean;
      paymentMethod?: string;
      paid?: boolean;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: typeof json.error === "string" ? json.error : "Checkout failed.",
        status: res.status
      };
    }

    const paidImmediately = json.paid === true || json.status === "paid";
    if (!paidImmediately && (!json.url || !json.sessionId)) {
      return { ok: false, error: "Invalid checkout response.", status: 502 };
    }

    return {
      ok: true,
      url: typeof json.url === "string" ? json.url : null,
      sessionId: typeof json.sessionId === "string" ? json.sessionId : "paid",
      gateway: typeof json.gateway === "string" ? json.gateway : "hyp",
      status: typeof json.status === "string" ? json.status : paidImmediately ? "paid" : "pending",
      mock: json.mock === true,
      paymentMethod: typeof json.paymentMethod === "string" ? json.paymentMethod : "credit_card",
      paid: paidImmediately
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
