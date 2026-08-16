import type { SupabaseClient } from "@supabase/supabase-js";
import { isFutureConfirmedScheduleBooking } from "@/lib/bookings/booking-shift-ui";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

/**
 * Parent-dashboard "shift booked successfully" notification.
 *
 * This is an event, not a persistent representation of an approved booking.
 * Primary persistence: `bookings.parent_notified_at` (does not change status).
 * Secondary cache: parent-scoped localStorage for immediate UI + pre-migration fallback.
 */

const STORAGE_PREFIX = "anynanny_dismissed_approved_bookings_v1";

export type ApprovedScheduleNotificationBooking = Pick<
  BookingRow,
  "id" | "status" | "booking_date" | "start_time" | "end_time" | "parent_notified_at"
>;

export function dismissedApprovedBookingsStorageKey(parentId: string): string {
  return `${STORAGE_PREFIX}:${String(parentId).trim()}`;
}

export function isApprovedScheduleNotificationAcknowledged(
  booking: Pick<BookingRow, "id" | "parent_notified_at"> | null | undefined,
  dismissedLocalIds?: Set<string>
): boolean {
  if (!booking) return true;
  if (booking.parent_notified_at) return true;
  if (dismissedLocalIds?.has(String(booking.id ?? ""))) return true;
  return false;
}

/** True when this future approved booking should still show the one-time success card. */
export function shouldShowApprovedScheduleNotification(
  booking: ApprovedScheduleNotificationBooking | null | undefined,
  dismissedLocalIds?: Set<string>,
  nowMs = Date.now()
): boolean {
  if (!booking) return false;
  if (!isFutureConfirmedScheduleBooking(booking, nowMs)) return false;
  return !isApprovedScheduleNotificationAcknowledged(booking, dismissedLocalIds);
}

/** Keep the current visit's success card, or pick the next unacknowledged approval. */
export function isApprovedScheduleNotificationCandidate(
  booking: ApprovedScheduleNotificationBooking | null | undefined,
  dismissedLocalIds?: Set<string>,
  stickyId?: string | null,
  nowMs = Date.now()
): boolean {
  if (!booking) return false;
  if (stickyId && String(booking.id) === String(stickyId)) {
    return isFutureConfirmedScheduleBooking(booking, nowMs);
  }
  return shouldShowApprovedScheduleNotification(booking, dismissedLocalIds, nowMs);
}

export function findUnacknowledgedFutureConfirmedBooking<
  T extends ApprovedScheduleNotificationBooking
>(
  rows: T[],
  dismissedLocalIds?: Set<string>,
  stickyId?: string | null,
  nowMs = Date.now()
): T | null {
  return (
    rows.find((row) =>
      isApprovedScheduleNotificationCandidate(row, dismissedLocalIds, stickyId, nowMs)
    ) ?? null
  );
}

export function readDismissedApprovedBookingIds(parentId: string | null | undefined): Set<string> {
  if (typeof window === "undefined") return new Set();
  const uid = String(parentId ?? "").trim();
  if (!uid) return new Set();
  try {
    const raw = window.localStorage.getItem(dismissedApprovedBookingsStorageKey(uid));
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

/** Local cache — used immediately on first view/dismiss and when DB column is unavailable. */
export function persistDismissedApprovedBookingId(
  parentId: string | null | undefined,
  bookingId: string
): void {
  if (typeof window === "undefined") return;
  const uid = String(parentId ?? "").trim();
  const id = String(bookingId ?? "").trim();
  if (!uid || !id) return;
  try {
    const next = readDismissedApprovedBookingIds(uid);
    next.add(id);
    window.localStorage.setItem(
      dismissedApprovedBookingsStorageKey(uid),
      JSON.stringify([...next])
    );
  } catch {
    /* ignore */
  }
}

/**
 * Persist approval-success notification acknowledgement for parent + booking.
 * Does NOT change booking.status — only sets parent_notified_at when available.
 */
export async function acknowledgeApprovedBookingNotification(
  supabase: SupabaseClient,
  parentId: string,
  bookingId: string
): Promise<{ ok: boolean; error: string | null }> {
  const uid = String(parentId ?? "").trim();
  const id = String(bookingId ?? "").trim();
  if (!uid || !id) {
    return { ok: false, error: "missing parent or booking id" };
  }

  persistDismissedApprovedBookingId(uid, id);

  const acknowledgedAt = new Date().toISOString();
  const { error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ parent_notified_at: acknowledgedAt })
    .eq("id", id)
    .eq("parent_id", uid)
    .eq("status", "approved")
    .is("parent_notified_at", null);

  if (!error) {
    return { ok: true, error: null };
  }

  const message = error.message ?? String(error);
  if (/column|parent_notified_at|schema cache|could not find|does not exist/i.test(message)) {
    return { ok: true, error: null };
  }

  return { ok: false, error: message };
}
