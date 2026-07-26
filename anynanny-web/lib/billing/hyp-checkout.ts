/**
 * Hyp Pay hosted checkout wrapper.
 *
 * Tries SuccessUrl/ErrorUrl pointing at /parent/checkout/complete so Supabase
 * finalizes after pay. If the terminal rejects dynamic URLs (CCode=902),
 * APISign retries without them and the iframe client finalizes from the
 * pending-checkout stash when Hyp's demo Thank You page appears.
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
  const result = await createHypTransaction({
    amountNis: params.amountNis,
    bookingId: params.bookingId,
    shiftSessionId: params.shiftSessionId,
    description: params.description,
    paymentMethod: params.paymentMethod,
    pageLang: "HEB",
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl
  });

  return {
    sessionId: result.sessionId,
    checkoutUrl: result.checkoutUrl
  };
}
