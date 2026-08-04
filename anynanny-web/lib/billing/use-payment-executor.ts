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
  /** Saved Hyp card id from parent_payment_methods. */
  paymentMethodId?: string | null;
  elapsedSeconds?: number;
};

export type PaymentExecutorResult =
  | {
      success: true;
      paymentSplit: ParentPaymentSplit;
      /** Hyp hosted checkout URL for iframe / redirect. Null when saved card charged immediately. */
      checkoutUrl: string | null;
      hypSessionId: string;
      paidImmediately?: boolean;
    }
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
          paymentMethodId: params.paymentMethodId ?? undefined,
          shiftDetails: {
            sessionId: params.sessionId,
            elapsedSeconds: params.elapsedSeconds
          }
        });

        if (!result.ok) {
          const message = formatParentCheckoutError(result.error);
          console.error("[usePaymentExecutor] checkout failed:", result.status, result.error);
          setError(message);
          return { success: false, error: message };
        }

        // Never accept mock / inline success — session finalizes only after Hyp sandbox.
        if (result.mock || result.gateway === "mock") {
          const message =
            "תשלום מדומה אינו זמין. יש להשלים תשלום דרך HYP Sandbox.";
          console.error("[usePaymentExecutor] rejected mock checkout:", result);
          setError(message);
          return { success: false, error: message };
        }

        if (result.paid || result.status === "paid") {
          return {
            success: true,
            paymentSplit,
            checkoutUrl: null,
            hypSessionId: String(result.sessionId),
            paidImmediately: true
          };
        }

        // Hosted pay-page success statuses are "pending" / "pending_checkout" — not "succeeded".
        if (result.status === "succeeded") {
          const message =
            "תשלום מדומה אינו זמין. יש להשלים תשלום דרך HYP Sandbox.";
          setError(message);
          return { success: false, error: message };
        }

        const checkoutUrl = String(result.url ?? "").trim();
        if (!checkoutUrl) {
          const message = "לא התקבל קישור לתשלום מ-HYP. נסו שוב.";
          setError(message);
          return { success: false, error: message };
        }

        return {
          success: true,
          paymentSplit,
          checkoutUrl,
          hypSessionId: String(result.sessionId)
        };
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
