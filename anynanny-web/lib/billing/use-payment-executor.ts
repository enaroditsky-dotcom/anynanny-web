"use client";

import { useCallback, useState } from "react";
import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";
import {
  computePlatformFeeFromParentTotal,
  type ParentPaymentSplit
} from "@/lib/billing/platform-fee";
import {
  formatParentCheckoutError,
  postParentCheckoutSession
} from "@/lib/billing/post-checkout-session";
import { PARENT_PLATFORM_FEE_MULTIPLIER } from "@/lib/sitter/public-search-card";

export type PaymentExecutorParams = {
  bookingId: string;
  sessionId: string;
  /** Sitter base amount (before the flat 10% platform fee). */
  sitterBaseNis: number;
  paymentMethod: CheckoutPaymentMethod;
  elapsedSeconds?: number;
};

export type PaymentExecutorResult =
  | { success: true; paymentSplit: ParentPaymentSplit }
  | { success: false; error: string };

/** Parent-facing total = sitter base × 1.1 (flat 10% platform fee). */
export function parentTotalFromSitterBaseNis(sitterBaseNis: number): ParentPaymentSplit {
  const parentTotalNis =
    Math.round(Math.max(0, sitterBaseNis) * PARENT_PLATFORM_FEE_MULTIPLIER * 100) / 100;
  return computePlatformFeeFromParentTotal(parentTotalNis);
}

export function usePaymentExecutor() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executePayment = useCallback(
    async (params: PaymentExecutorParams): Promise<PaymentExecutorResult> => {
      const paymentSplit = parentTotalFromSitterBaseNis(params.sitterBaseNis);
      const amountMinorUnits = Math.max(50, paymentSplit.totalMinorUnits);

      setBusy(true);
      setError(null);

      try {
        const result = await postParentCheckoutSession({
          bookingId: params.bookingId,
          amountMinorUnits,
          currency: "ils",
          description: "תשלום משמרת AnyNanny",
          paymentMethod: params.paymentMethod,
          shiftDetails: {
            sessionId: params.sessionId,
            elapsedSeconds: params.elapsedSeconds
          }
        });

        if (!result.ok) {
          const message = formatParentCheckoutError(result.error);
          setError(message);
          return { success: false, error: message };
        }

        if (result.status !== "succeeded" && !result.mock) {
          const message = "התשלום לא הושלם. נסו שוב.";
          setError(message);
          return { success: false, error: message };
        }

        return { success: true, paymentSplit };
      } catch (e) {
        console.error("[usePaymentExecutor]", e);
        const message = "שגיאה בעיבוד התשלום. נסו שוב.";
        setError(message);
        return { success: false, error: message };
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  return { executePayment, busy, error, clearError, setError };
}
