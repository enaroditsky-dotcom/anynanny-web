/**
 * Hyp Pay hosted checkout wrapper.
 *
 * Uses official APISign (Masof + KEY + PassP). Dynamic SuccessUrl/ErrorUrl are
 * intentionally NOT sent by default — unregistered origins cause CCode=902.
 * Configure return URLs on the Hyp terminal to:
 *   {APP_ORIGIN}/parent/checkout/complete?checkout=success
 */

import {
  createHypTransaction,
  getHypCredentials,
  isHypConfigured,
  HYP_DASHBOARD_API_CREDENTIALS
} from "@/lib/billing/hyp/create-transaction";

export type HypCheckoutParams = {
  bookingId: string;
  amountNis: number;
  successUrl: string;
  paymentMethod: string;
  description: string;
  shiftSessionId?: string | null;
  cancelUrl?: string | null;
};

export type HypCheckoutSession = {
  sessionId: string;
  checkoutUrl: string;
};

export { getHypCredentials, isHypConfigured, HYP_DASHBOARD_API_CREDENTIALS };

export function resolveHypPayBaseUrl(): string {
  try {
    return getHypCredentials().payBaseUrl;
  } catch {
    return "https://pay.hyp.co.il/p/";
  }
}

export async function createHypCheckoutSession(
  params: HypCheckoutParams
): Promise<HypCheckoutSession> {
  // Pass amount/booking only. Return URLs stay in the Hyp terminal settings so
  // APISign does not fail with CCode=902 (origin mismatch).
  const result = await createHypTransaction({
    amountNis: params.amountNis,
    bookingId: params.bookingId,
    shiftSessionId: params.shiftSessionId,
    description: params.description,
    paymentMethod: params.paymentMethod,
    pageLang: "HEB"
  });

  return {
    sessionId: result.sessionId,
    checkoutUrl: result.checkoutUrl
  };
}
