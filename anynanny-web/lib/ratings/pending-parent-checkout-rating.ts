const STORAGE_KEY = "anynanny_pending_parent_rating";

export type PendingParentCheckoutRating = {
  sessionId: string;
  rating: number;
  bookingId: string;
};

export function stashPendingParentCheckoutRating(value: PendingParentCheckoutRating): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readPendingParentCheckoutRating(): PendingParentCheckoutRating | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingParentCheckoutRating>;
    const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId.trim() : "";
    const bookingId = typeof parsed.bookingId === "string" ? parsed.bookingId.trim() : "";
    const rating = Number(parsed.rating);
    if (!sessionId || !bookingId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return null;
    }
    return { sessionId, bookingId, rating };
  } catch {
    return null;
  }
}

export function clearPendingParentCheckoutRating(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
