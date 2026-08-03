import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";

const STORAGE_PREFIX = "anynanny.parentPreferredCheckoutMethod";

export type ParentPreferredCheckoutMethod = Extract<
  CheckoutPaymentMethod,
  "credit_card" | "bit" | "paybox"
>;

function storageKey(parentId: string): string {
  return `${STORAGE_PREFIX}.${parentId.trim()}`;
}

export function readParentPreferredCheckoutMethod(
  parentId: string | null | undefined
): ParentPreferredCheckoutMethod | null {
  if (typeof window === "undefined" || !parentId?.trim()) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(parentId));
    if (raw === "credit_card" || raw === "bit" || raw === "paybox") return raw;
  } catch {
    /* ignore quota / private mode */
  }
  return null;
}

export function writeParentPreferredCheckoutMethod(
  parentId: string,
  method: ParentPreferredCheckoutMethod
): void {
  if (typeof window === "undefined" || !parentId.trim()) return;
  try {
    window.localStorage.setItem(storageKey(parentId), method);
  } catch {
    /* ignore */
  }
}
