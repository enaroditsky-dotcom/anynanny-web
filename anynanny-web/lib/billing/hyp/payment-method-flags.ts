import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";

/**
 * Map AnyNanny checkout rails → Hyp Pay APISign flags.
 *
 * Hyp Pay docs:
 * - `hideBtns=True` hides digital-wallet buttons.
 * - `ppsJSONConfig` can configure payment-page behavior.
 * - iframe integrations should include `frameAncestorURLs`
 *   pointing to the merchant website that embeds the HYP page.
 */

export type HypPaymentMethodRail =
  | CheckoutPaymentMethod
  | string;

const DEFAULT_FRAME_ANCESTOR_URL =
  "https://www.anynanny.org";

function hypTrueFalse(
  value: boolean
): "True" | "False" {
  return value
    ? "True"
    : "False";
}

function normalizeRail(
  raw: string | null | undefined
): string {
  return String(
    raw ?? "credit_card"
  )
    .trim()
    .toLowerCase()
    .replace(
      /[\s-]+/g,
      "_"
    );
}

/**
 * Merchant origin allowed to embed the HYP payment page.
 *
 * Prefer NEXT_PUBLIC_APP_URL so Preview/Production can override it.
 * Production fallback is www.anynanny.org.
 */
function resolveFrameAncestorUrl(): string {
  const raw =
    String(
      process.env.NEXT_PUBLIC_APP_URL ??
        DEFAULT_FRAME_ANCESTOR_URL
    ).trim();

  if (!raw) {
    return DEFAULT_FRAME_ANCESTOR_URL;
  }

  try {
    const url =
      new URL(raw);

    return url.origin;
  } catch {
    return DEFAULT_FRAME_ANCESTOR_URL;
  }
}

type HypUiCustomData = {
  defaultPaymentMethod?: string;
  paymentMethods?: Array<{
    type: string;
    hidden: boolean;
  }>;
};

/**
 * Build the JSON sent as ppsJSONConfig.
 *
 * frameAncestorURLs is intentionally top-level.
 * uiCustomData remains nested, as expected by HYP.
 */
function buildPpsJsonConfig(
  uiCustomData?: HypUiCustomData
): string {
  const payload: {
    frameAncestorURLs: string;
    uiCustomData?: HypUiCustomData;
  } = {
    frameAncestorURLs:
      resolveFrameAncestorUrl()
  };

  if (uiCustomData) {
    payload.uiCustomData =
      uiCustomData;
  }

  return JSON.stringify(
    payload
  );
}

function buildUiCustomData(input: {
  defaultPaymentMethod: string;
  hideTypes: string[];
}): HypUiCustomData {
  return {
    defaultPaymentMethod:
      input.defaultPaymentMethod,

    paymentMethods:
      input.hideTypes.map(
        (type) => ({
          type,
          hidden: true
        })
      )
  };
}

/**
 * Extra APISign entries so the hosted page opens the rail
 * selected by the user.
 *
 * ppsJSONConfig is included for ALL hosted checkout methods
 * so HYP knows which merchant origin is allowed to embed
 * the payment page in an iframe.
 */
export function buildHypPaymentMethodSignEntries(
  paymentMethod:
    | HypPaymentMethodRail
    | null
    | undefined
): Array<[string, string]> {
  const rail =
    normalizeRail(
      paymentMethod
    );

  const entries:
    Array<
      [string, string]
    > = [];

  if (
    rail ===
    "bit"
  ) {
    /*
     * Show wallet buttons and open Bit when supported.
     * Hyp Enterprise: uiCustomData.defaultPaymentMethod=bit opens Bit
     * immediately (skips the credit-card form). Classic hideBtns=False
     * keeps the Bit button visible when Bit is enabled on the terminal.
     */
    entries.push([
      "hideBtns",
      hypTrueFalse(
        false
      )
    ]);

    /*
     * Bit does not support installments.
     */
    entries.push([
      "Tash",
      "1"
    ]);

    entries.push([
      "FixTash",
      hypTrueFalse(
        true
      )
    ]);

    entries.push([
      "defaultPaymentMethod",
      "bit"
    ]);

    /*
     * Legacy Yaad/HYP enable flag.
     */
    entries.push([
      "Bit",
      hypTrueFalse(
        true
      )
    ]);

    entries.push([
      "ppsJSONConfig",

      buildPpsJsonConfig(
        buildUiCustomData({
          defaultPaymentMethod:
            "bit",

          hideTypes: [
            "applepay",
            "googlepay",
            "paybox",
            "ipr",
            "pcp",
            "a2a"
          ]
        })
      )
    ]);

    const bitTmp =
      String(
        process.env.HYP_BIT_TMP ??
          ""
      ).trim();

    if (bitTmp) {
      entries.push([
        "tmp",
        bitTmp
      ]);
    }

    return entries;
  }

  if (
    rail ===
    "paybox"
  ) {
    entries.push([
      "hideBtns",
      hypTrueFalse(
        false
      )
    ]);

    entries.push([
      "Tash",
      "1"
    ]);

    entries.push([
      "FixTash",
      hypTrueFalse(
        true
      )
    ]);

    entries.push([
      "PayBox",
      hypTrueFalse(
        true
      )
    ]);

    /*
     * Hyp Enterprise documents defaultPaymentMethod values:
     * creditcard | applepay | googlepay | bit | ipr | pcp | a2a.
     * "paybox" is NOT a documented value — sending it makes the hosted
     * page fall back to the credit-card form. Prefer legacy PayBox=True
     * (above) plus ppsJSONConfig that only hides competing wallets.
     */
    entries.push([
      "ppsJSONConfig",

      buildPpsJsonConfig({
        paymentMethods: [
          { type: "applepay", hidden: true },
          { type: "googlepay", hidden: true },
          { type: "bit", hidden: true },
          { type: "ipr", hidden: true },
          { type: "pcp", hidden: true },
          { type: "a2a", hidden: true }
        ]
      })
    ]);

    const payboxTmp =
      String(
        process.env.HYP_PAYBOX_TMP ??
          ""
      ).trim();

    if (payboxTmp) {
      entries.push([
        "tmp",
        payboxTmp
      ]);
    }

    return entries;
  }

  /**
   * credit_card / wallet / unknown
   *
   * Card form only — no competing wallet chrome.
   */
  entries.push([
    "hideBtns",
    hypTrueFalse(
      true
    )
  ]);

  /**
   * IMPORTANT:
   *
   * Even ordinary card checkout needs ppsJSONConfig
   * because the page may be embedded / use PPS UI.
   */
  entries.push([
    "ppsJSONConfig",

    buildPpsJsonConfig({
      defaultPaymentMethod:
        "creditcard"
    })
  ]);

  return entries;
}

export function hypPaymentMethodDescription(
  paymentMethod:
    | HypPaymentMethodRail
    | null
    | undefined,

  purpose:
    | "deposit"
    | "payment_method"
    | "checkout" =
    "checkout"
): string {
  const rail =
    normalizeRail(
      paymentMethod
    );

  if (
    purpose ===
    "payment_method"
  ) {
    if (
      rail ===
      "bit"
    ) {
      return "רישום / תשלום Bit — AnyNanny (HYP)";
    }

    if (
      rail ===
      "paybox"
    ) {
      return "רישום / תשלום PayBox — AnyNanny (HYP)";
    }

    return "שמירת אמצעי תשלום — AnyNanny (Visa / Mastercard / Isracard / Amex)";
  }

  if (
    purpose ===
    "deposit"
  ) {
    if (
      rail ===
      "bit"
    ) {
      return "טעינת ארנק ב־Bit — AnyNanny";
    }

    if (
      rail ===
      "paybox"
    ) {
      return "טעינת ארנק ב־PayBox — AnyNanny";
    }

    return "טעינת ארנק דיגיטלי — AnyNanny";
  }

  if (
    rail ===
    "bit"
  ) {
    return "תשלום משמרת ב־Bit — AnyNanny";
  }

  if (
    rail ===
    "paybox"
  ) {
    return "תשלום משמרת ב־PayBox — AnyNanny";
  }

  return "תשלום משמרת AnyNanny";
}

/**
 * Bit rejects amounts above ₪5,000
 * on the hosted payment page.
 */
export function validateHypWalletAmount(
  paymentMethod:
    | HypPaymentMethodRail
    | null
    | undefined,

  amountNis: number
): string | null {
  const rail =
    normalizeRail(
      paymentMethod
    );

  if (
    rail ===
      "bit" &&
    Number.isFinite(
      amountNis
    ) &&
    amountNis >
      5000
  ) {
    return "תשלום ב־Bit מוגבל עד ₪5,000. בחרו כרטיס או PayBox לסכום גבוה יותר.";
  }

  return null;
}