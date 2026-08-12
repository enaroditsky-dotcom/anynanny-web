"use client";

/**
 * Parent-dashboard rejection notification dismissals.
 * Persists in localStorage so logout/login keeps acknowledgements.
 * Scoped by parent id so one parent cannot affect another on the same device.
 * Keyed by booking id so each rejection is independent.
 */

const STORAGE_PREFIX = "anynanny_dismissed_rejected_bookings_v1";

export function dismissedRejectedBookingsStorageKey(parentId: string): string {
  return `${STORAGE_PREFIX}:${String(parentId).trim()}`;
}

export function readDismissedRejectedBookingIds(parentId: string | null | undefined): Set<string> {
  if (typeof window === "undefined") return new Set();
  const uid = String(parentId ?? "").trim();
  if (!uid) return new Set();
  try {
    const raw = window.localStorage.getItem(dismissedRejectedBookingsStorageKey(uid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    );
  } catch {
    return new Set();
  }
}

/** Persist dismissal for one specific rejected booking id. */
export function persistDismissedRejectedBookingId(
  parentId: string | null | undefined,
  bookingId: string
): void {
  if (typeof window === "undefined") return;
  const uid = String(parentId ?? "").trim();
  const id = String(bookingId ?? "").trim();
  if (!uid || !id) return;
  try {
    const next = readDismissedRejectedBookingIds(uid);
    next.add(id);
    window.localStorage.setItem(
      dismissedRejectedBookingsStorageKey(uid),
      JSON.stringify([...next])
    );
  } catch {
    /* ignore */
  }
}
