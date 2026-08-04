import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";
import type { ParentPaymentSplit } from "@/lib/billing/platform-fee";

export type MockCheckoutInput = {
  bookingId: string;
  successUrl: string;
  paymentMethod: CheckoutPaymentMethod;
  paymentSplit: ParentPaymentSplit;
  shiftDetails?: {
    sessionId?: string;
    elapsedSeconds?: number;
  };
};

export type MockCheckoutSession = {
  sessionId: string;
  url: string;
  status: "succeeded";
  gateway: "mock";
  mock: true;
  paymentMethod: CheckoutPaymentMethod;
  amountMinorUnits: number;
  platformFeeMinorUnits: number;
  platformFeeNis: number;
  sitterBaseNis: number;
  totalNis: number;
};

/** Simulates a successful gateway session without calling external payment providers. */
export function createMockCheckoutSession(input: MockCheckoutInput): MockCheckoutSession {
  const sessionId = `mock_${input.bookingId}_${Date.now()}`;
  const returnUrl = new URL(input.successUrl);
  returnUrl.searchParams.set("checkout", "success");
  returnUrl.searchParams.set("sessionId", sessionId);
  returnUrl.searchParams.set("gateway", "mock");
  returnUrl.searchParams.set("paymentMethod", input.paymentMethod);

  const sessionIdFromShift = input.shiftDetails?.sessionId?.trim();
  if (sessionIdFromShift) {
    returnUrl.searchParams.set("shiftSessionId", sessionIdFromShift);
  }

  return {
    sessionId,
    url: returnUrl.toString(),
    status: "succeeded",
    gateway: "mock",
    mock: true,
    paymentMethod: input.paymentMethod,
    amountMinorUnits: input.paymentSplit.totalMinorUnits,
    platformFeeMinorUnits: input.paymentSplit.platformFeeMinorUnits,
    platformFeeNis: input.paymentSplit.platformFeeNis,
    sitterBaseNis: input.paymentSplit.sitterBaseNis,
    totalNis: input.paymentSplit.totalNis
  };
}
