const STORAGE_PREFIX = "anynanny.parentPreferredCheckoutMethod";

export type ParentPreferredCheckoutMethod =
  | "credit_card"
  | "bit"
  | "apple_pay"
  | "google_pay";

function storageKey(parentId: string): string {
  return `${STORAGE_PREFIX}.${parentId.trim()}`;
}

export function readParentPreferredCheckoutMethod(
  parentId: string | null | undefined
): ParentPreferredCheckoutMethod | null {
  if (typeof window === "undefined" || !parentId?.trim()) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(parentId));
    if (
      raw === "credit_card" ||
      raw === "bit" ||
      raw === "apple_pay" ||
      raw === "google_pay"
    )
      return raw;
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
