export const SUPPORTED_CHECKOUT_PAYMENT_METHODS = [
  "credit_card",
  "bit",
  "paybox",
  "wallet"
] as const;

export type CheckoutPaymentMethod = (typeof SUPPORTED_CHECKOUT_PAYMENT_METHODS)[number];

const PAYMENT_METHOD_SET = new Set<string>(SUPPORTED_CHECKOUT_PAYMENT_METHODS);

export const DEFAULT_CHECKOUT_PAYMENT_METHOD: CheckoutPaymentMethod = "credit_card";

export function parseCheckoutPaymentMethod(value: unknown): CheckoutPaymentMethod | null {
  const normalized = String(value ?? DEFAULT_CHECKOUT_PAYMENT_METHOD).trim().toLowerCase();
  return PAYMENT_METHOD_SET.has(normalized) ? (normalized as CheckoutPaymentMethod) : null;
}
