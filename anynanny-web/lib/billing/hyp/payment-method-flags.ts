import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";

/**
 * Map AnyNanny checkout rails → Hyp Pay APISign flags.
 *
 * Hyp Pay docs: `hideBtns=True` hides digital-wallet buttons (Bit / Apple / Google).
 * Hyp / CreditGuard PPS pages also honor `defaultPaymentMethod` + `paymentMethods`
 * (same shape as Hyp Enterprise `uiCustomData`) when the terminal serves the modern page.
 *
 * @see https://developers.hyp.co.il/pay/common-use-cases/customizing-payment-page-design
 * @see https://developers.hyp.co.il/enterprise/changing-the-default-payment-page-appearance/managing-payment-methods
 */

export type HypPaymentMethodRail = CheckoutPaymentMethod | string;

function hypTrueFalse(value: boolean): "True" | "False" {
  return value ? "True" : "False";
}

function normalizeRail(raw: string | null | undefined): string {
  return String(raw ?? "credit_card")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function buildUiCustomDataJson(input: {
  defaultPaymentMethod: string;
  hideTypes: string[];
}): string {
  return JSON.stringify({
    uiCustomData: {
      defaultPaymentMethod: input.defaultPaymentMethod,
      paymentMethods: input.hideTypes.map((type) => ({ type, hidden: true }))
    }
  });
}

/**
 * Extra APISign entries so the hosted page opens the rail the user clicked.
 * Safe to append after the core Amount/Info/Tash fields.
 */
export function buildHypPaymentMethodSignEntries(
  paymentMethod: HypPaymentMethodRail | null | undefined
): Array<[string, string]> {
  const rail = normalizeRail(paymentMethod);
  const entries: Array<[string, string]> = [];

  if (rail === "bit") {
    // Show wallet buttons; open Bit UI immediately when the terminal supports it.
    entries.push(["hideBtns", hypTrueFalse(false)]);
    // Bit does not support installments — lock to a single charge.
    entries.push(["Tash", "1"]);
    entries.push(["FixTash", hypTrueFalse(true)]);
    entries.push(["defaultPaymentMethod", "bit"]);
    // Legacy Yaad-style enable flag (ignored when unsupported; echoed when supported).
    entries.push(["Bit", hypTrueFalse(true)]);
    entries.push([
      "ppsJSONConfig",
      buildUiCustomDataJson({
        defaultPaymentMethod: "bit",
        hideTypes: ["applepay", "googlepay", "paybox", "ipr", "pcp", "a2a"]
      })
    ]);
    const bitTmp = String(process.env.HYP_BIT_TMP ?? "").trim();
    if (bitTmp) entries.push(["tmp", bitTmp]);
    return entries;
  }

  if (rail === "paybox") {
    entries.push(["hideBtns", hypTrueFalse(false)]);
    entries.push(["Tash", "1"]);
    entries.push(["FixTash", hypTrueFalse(true)]);
    entries.push(["defaultPaymentMethod", "paybox"]);
    entries.push(["PayBox", hypTrueFalse(true)]);
    entries.push([
      "ppsJSONConfig",
      buildUiCustomDataJson({
        defaultPaymentMethod: "paybox",
        hideTypes: ["applepay", "googlepay", "bit", "ipr", "pcp", "a2a"]
      })
    ]);
    const payboxTmp = String(process.env.HYP_PAYBOX_TMP ?? "").trim();
    if (payboxTmp) entries.push(["tmp", payboxTmp]);
    return entries;
  }

  // credit_card / wallet / unknown → card form only (no competing wallet chrome).
  entries.push(["hideBtns", hypTrueFalse(true)]);
  if (rail === "credit_card" || rail === "wallet" || !rail) {
    entries.push(["defaultPaymentMethod", "creditcard"]);
  }
  return entries;
}

export function hypPaymentMethodDescription(
  paymentMethod: HypPaymentMethodRail | null | undefined,
  purpose: "deposit" | "payment_method" | "checkout" = "checkout"
): string {
  const rail = normalizeRail(paymentMethod);
  if (purpose === "payment_method") {
    if (rail === "bit") return "רישום / תשלום Bit — AnyNanny (HYP)";
    if (rail === "paybox") return "רישום / תשלום PayBox — AnyNanny (HYP)";
    return "שמירת אמצעי תשלום — AnyNanny (Visa / Mastercard / Isracard / Amex)";
  }
  if (purpose === "deposit") {
    if (rail === "bit") return "טעינת ארנק ב־Bit — AnyNanny";
    if (rail === "paybox") return "טעינת ארנק ב־PayBox — AnyNanny";
    return "טעינת ארנק דיגיטלי — AnyNanny";
  }
  if (rail === "bit") return "תשלום משמרת ב־Bit — AnyNanny";
  if (rail === "paybox") return "תשלום משמרת ב־PayBox — AnyNanny";
  return "תשלום משמרת AnyNanny";
}

/** Bit rejects amounts above ₪5,000 on the hosted page. */
export function validateHypWalletAmount(
  paymentMethod: HypPaymentMethodRail | null | undefined,
  amountNis: number
): string | null {
  const rail = normalizeRail(paymentMethod);
  if (rail === "bit" && Number.isFinite(amountNis) && amountNis > 5000) {
    return "תשלום ב־Bit מוגבל עד ₪5,000. בחרו כרטיס או PayBox לסכום גבוה יותר.";
  }
  return null;
}
