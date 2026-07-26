/**
 * Official Hyp Pay sandbox test cards.
 * Source: https://developers.hyp.co.il/pay/getting-started/testing-environments.md
 *
 * Important:
 * - Test terminals have Masof numbers that always start with `00100`.
 * - `4580458045804580` is the documented FAILURE card (returns "העסקה לא אושרה").
 * - Use the Mastercard below for an approved sandbox charge.
 * - Keep sandbox amounts low (~10 NIS) — many merchants share these cards.
 */

export const HYP_TEST_TERMINAL_PREFIX = "00100";

/** Approved sandbox charge — CCode=0 on success redirect. */
export const HYP_SANDBOX_SUCCESS_CARD = {
  number: "5253360311315452",
  numberDisplay: "5253 3603 1131 5452",
  expiryMonth: "12",
  expiryYear: "29",
  expiryDisplay: "12/29",
  cvv: "493",
  israeliId: "890108558",
  brand: "Mastercard"
} as const;

/**
 * Documented failure card — Hyp intentionally declines this with
 * "Transaction not approved / העסקה לא אושרה".
 * Do NOT use this when verifying a happy-path sandbox payment.
 */
export const HYP_SANDBOX_FAILURE_CARD = {
  number: "4580458045804580",
  numberDisplay: "4580 4580 4580 4580",
  expiryDisplay: "Any future date",
  cvv: "123",
  israeliId: "Any valid ID",
  brand: "Visa"
} as const;

export const HYP_SANDBOX_RECOMMENDED_AMOUNT_NIS = 10;

export function isHypTestTerminalMasof(masof: string | null | undefined): boolean {
  const m = String(masof ?? "").trim();
  return m.startsWith(HYP_TEST_TERMINAL_PREFIX);
}

export function hypSandboxTestCardHelpHe(): string {
  return [
    "כרטיס בדיקה מאושר (HYP):",
    `${HYP_SANDBOX_SUCCESS_CARD.numberDisplay}`,
    `תוקף ${HYP_SANDBOX_SUCCESS_CARD.expiryDisplay} · CVV ${HYP_SANDBOX_SUCCESS_CARD.cvv} · ת.ז. ${HYP_SANDBOX_SUCCESS_CARD.israeliId}`,
    `לא להשתמש ב-${HYP_SANDBOX_FAILURE_CARD.numberDisplay} — זה כרטיס כישלון מתועד.`
  ].join("\n");
}
