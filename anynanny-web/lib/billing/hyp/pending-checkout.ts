/** Browser-only stash so Hyp return can finalize even after a full page reload. */

export const HYP_PENDING_CHECKOUT_KEY = "anynanny_hyp_pending_checkout";

export type HypPendingCheckout = {
  bookingId: string;
  sessionId: string | null;
  savedAt: number;
};

export function saveHypPendingCheckout(input: {
  bookingId: string;
  sessionId?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const bookingId = String(input.bookingId ?? "").trim();
  if (!bookingId) return;
  const payload: HypPendingCheckout = {
    bookingId,
    sessionId: input.sessionId ? String(input.sessionId).trim() : null,
    savedAt: Date.now()
  };
  try {
    window.sessionStorage.setItem(HYP_PENDING_CHECKOUT_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function readHypPendingCheckout(maxAgeMs = 2 * 60 * 60 * 1000): HypPendingCheckout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HYP_PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HypPendingCheckout;
    if (!parsed?.bookingId || typeof parsed.bookingId !== "string") return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > maxAgeMs) {
      clearHypPendingCheckout();
      return null;
    }
    return {
      bookingId: parsed.bookingId.trim(),
      sessionId: parsed.sessionId ? String(parsed.sessionId).trim() : null,
      savedAt: parsed.savedAt
    };
  } catch {
    return null;
  }
}

export function clearHypPendingCheckout(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(HYP_PENDING_CHECKOUT_KEY);
  } catch {
    // ignore
  }
}
