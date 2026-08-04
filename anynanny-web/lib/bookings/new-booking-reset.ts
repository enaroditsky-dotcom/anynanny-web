/**
 * Cross-surface signal: a brand-new booking was created.
 * Parent/sitter dashboards clear settlement ghosts so the fresh request starts clean.
 */
export const ANYNANNY_NEW_BOOKING_EVENT = "anynanny:new-booking";
const NEW_BOOKING_STORAGE_KEY = "anynanny_new_booking_v1";

export type NewBookingEventDetail = {
  bookingId: string;
  parentId?: string;
  sitterId?: string;
};

export function dispatchNewBookingCreated(detail: NewBookingEventDetail): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      NEW_BOOKING_STORAGE_KEY,
      JSON.stringify({ ...detail, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent<NewBookingEventDetail>(ANYNANNY_NEW_BOOKING_EVENT, { detail })
  );
}

/** Consume a pending new-booking marker (e.g. after navigating to the dashboard). */
export function consumeNewBookingMarker(): NewBookingEventDetail | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NEW_BOOKING_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(NEW_BOOKING_STORAGE_KEY);
    const parsed = JSON.parse(raw) as NewBookingEventDetail & { at?: number };
    if (!parsed?.bookingId) return null;
    // Ignore markers older than 2 minutes.
    if (parsed.at && Date.now() - parsed.at > 120_000) return null;
    return {
      bookingId: String(parsed.bookingId),
      parentId: parsed.parentId ? String(parsed.parentId) : undefined,
      sitterId: parsed.sitterId ? String(parsed.sitterId) : undefined
    };
  } catch {
    return null;
  }
}

/** Booking statuses that belong to a fresh / in-progress shift — never settlement UI. */
export const FRESH_LIVE_BOOKING_STATUSES = new Set([
  "pending",
  "approved",
  "sitter_started",
  "parent_started"
]);

export function isFreshLiveBookingStatus(status: unknown): boolean {
  return FRESH_LIVE_BOOKING_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

/**
 * Settlement / waiting-for-payment UI is only valid when the booking itself is
 * at end-of-shift or unpaid-completed — never for a new pending/approved ask.
 */
export function bookingAllowsSettlementClosureUi(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "sitter_ended" || s === "completed";
}
