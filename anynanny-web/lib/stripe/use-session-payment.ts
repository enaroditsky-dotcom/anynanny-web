"use client";

import { useCallback, useRef, useState } from "react";
import { chargeSession, type ChargeSessionResult } from "@/lib/stripe/charge-session";

export type PaymentToast = {
  variant: "success" | "info";
  message: string;
};

export type UseSessionPaymentState = {
  isProcessing: boolean;
  paymentError: string | null;
  paymentToast: PaymentToast | null;
  /** Last raw result from `chargeSession` — useful when 3DS requires extra handling. */
  lastResult: ChargeSessionResult | null;
};

export type UseSessionPaymentApi = UseSessionPaymentState & {
  handlePayment: (sessionId: string) => Promise<ChargeSessionResult>;
  clearPaymentError: () => void;
  clearPaymentToast: () => void;
  reset: () => void;
};

const DEFAULT_ERROR = "התשלום נכשל. נסו שוב או בחרו אמצעי תשלום אחר.";

/** Map structured error codes from `/api/stripe/charge-session` to user-facing Hebrew copy. */
function localizeChargeError(result: Extract<ChargeSessionResult, { ok: false }>): string {
  switch (result.code) {
    case "missing_session_id":
      return "לא נמצאה משמרת לתשלום.";
    case "session_not_found":
      return "לא נמצאה המשמרת בבסיס הנתונים.";
    case "session_incomplete":
      return "המשמרת עדיין לא הסתיימה — לא ניתן לחייב.";
    case "already_paid":
      return "המשמרת כבר שולמה.";
    case "missing_stripe_customer":
      return "אין אמצעי תשלום שמור. הוסיפו כרטיס בהגדרות החשבון.";
    case "no_default_payment_method":
      return "אין כרטיס ברירת מחדל. עברו להגדרות תשלום והוסיפו כרטיס.";
    case "zero_amount":
      return "משך המשמרת קצר מדי לחיוב.";
    case "card_declined":
      return result.declineCode
        ? `הכרטיס נדחה (${result.declineCode}). נסו אמצעי תשלום אחר.`
        : "הכרטיס נדחה. נסו אמצעי תשלום אחר.";
    case "forbidden":
      return "אין הרשאה לבצע תשלום עבור משמרת זו.";
    case "unauthorized":
      return "פג תוקף ההזדהות — התחברו מחדש ונסו שוב.";
    case "network_error":
      return "אין חיבור לאינטרנט. נסו שוב בעוד רגע.";
    case "invalid_response":
      return "תקלה זמנית בשרת. נסו שוב.";
    default:
      if (result.httpStatus === 402) {
        return "החיוב דורש אישור נוסף או נדחה. נסו שוב.";
      }
      return result.message?.trim() || DEFAULT_ERROR;
  }
}

/** Encapsulated payment trigger for Review & Pay step — exposes loading, error, and toast state. */
export function useSessionPayment(): UseSessionPaymentApi {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentToast, setPaymentToast] = useState<PaymentToast | null>(null);
  const [lastResult, setLastResult] = useState<ChargeSessionResult | null>(null);
  const inFlightRef = useRef(false);

  const clearPaymentError = useCallback(() => setPaymentError(null), []);
  const clearPaymentToast = useCallback(() => setPaymentToast(null), []);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setPaymentError(null);
    setPaymentToast(null);
    setLastResult(null);
    inFlightRef.current = false;
  }, []);

  const handlePayment = useCallback(async (sessionId: string): Promise<ChargeSessionResult> => {
    if (inFlightRef.current) {
      return (
        lastResult ?? {
          ok: false,
          code: "in_flight",
          message: "התשלום כבר בעיבוד.",
          httpStatus: 0
        }
      );
    }

    inFlightRef.current = true;
    setIsProcessing(true);
    setPaymentError(null);
    setPaymentToast(null);

    let result: ChargeSessionResult;
    try {
      result = await chargeSession(sessionId);
    } catch (err) {
      result = {
        ok: false,
        code: "client_exception",
        message: err instanceof Error ? err.message : "תקלה לא צפויה.",
        httpStatus: 0,
        raw: err
      };
    }

    setLastResult(result);

    if (result.ok) {
      setPaymentToast({
        variant: result.alreadyPaid ? "info" : "success",
        message: result.alreadyPaid ? "המשמרת כבר שולמה." : "התשלום הושלם בהצלחה!"
      });
    } else {
      setPaymentError(localizeChargeError(result));
    }

    setIsProcessing(false);
    inFlightRef.current = false;
    return result;
  }, [lastResult]);

  return {
    isProcessing,
    paymentError,
    paymentToast,
    lastResult,
    handlePayment,
    clearPaymentError,
    clearPaymentToast,
    reset
  };
}
