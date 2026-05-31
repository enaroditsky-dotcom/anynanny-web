import type { BookingRow, BookingStatus } from "@/lib/bookings/constants";
import { SHIFT_ACTIVATION_LEAD_MS } from "@/lib/bookings/booking-shift-constants";
import {
  normalizeBookingStatus,
  type BookingStatusInput
} from "@/lib/bookings/booking-status-normalize";

export { SHIFT_ACTIVATION_LEAD_MS } from "@/lib/bookings/booking-shift-constants";

/** Booking row is closed — never show live shift / Double-Shake controls. */
export const BOOKING_TERMINAL_STATUSES: readonly BookingStatus[] = [
  "completed",
  "cancelled",
  "rejected"
];

/** Shift is in progress (timer / end-shift actions). */
export const BOOKING_LIVE_SHIFT_STATUSES: readonly BookingStatus[] = [
  "parent_started",
  "sitter_ended"
];

/** Awaiting arrival / parent approval before the shift is live. */
export const BOOKING_PENDING_START_STATUSES: readonly BookingStatus[] = [
  "approved",
  "sitter_started"
];

export function isBookingTerminalStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized ? BOOKING_TERMINAL_STATUSES.includes(normalized) : false;
}

export function isBookingLiveShiftStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized ? BOOKING_LIVE_SHIFT_STATUSES.includes(normalized) : false;
}

export function isBookingPendingStartStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized ? BOOKING_PENDING_START_STATUSES.includes(normalized) : false;
}

export function isNowWithinScheduledBookingWindow(
  booking: Pick<BookingRow, "start_time" | "end_time">,
  nowMs = new Date().getTime()
): boolean {
  const startMs = new Date(booking.start_time).getTime();
  const endMs = new Date(booking.end_time).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return nowMs >= startMs && nowMs <= endMs;
}

/**
 * Whether the Double-Shake control should be Enabled by the wall clock.
 * Uses explicit epoch-ms math via `getTime()` so the comparison is identical
 * across the user's local clock (e.g. Israel UTC+3) and Supabase `timestamptz`:
 *
 *   diffMs = new Date(p_start_time).getTime() - new Date().getTime();
 *
 * Active when `diffMs <= 600_000` (10 min) AND `now <= end_time`. This single
 * inequality covers:
 *   1. Within the 10-min lead window before scheduled start.
 *   2. After scheduled start, while shift hasn't been activated yet.
 *   3. "Now-for-now" shifts created ≤10 min away from the current moment.
 */
export function isNowWithinShiftActivationWindow(
  booking: Pick<BookingRow, "start_time" | "end_time">,
  nowMs = new Date().getTime()
): boolean {
  const startMs = new Date(booking.start_time).getTime();
  const endMs = new Date(booking.end_time).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  const diffMs = startMs - nowMs;
  return diffMs <= SHIFT_ACTIVATION_LEAD_MS && nowMs <= endMs;
}

/**
 * Whether today's linked booking should drive Double-Shake / live timer UI.
 * Live statuses use DB status only. Pending-start rows are included for the whole
 * calendar day so the circle can show a pre-window countdown; button activation
 * is gated separately via {@link isNowWithinShiftActivationWindow}.
 */
export function isBookingEligibleForLiveShiftUi(
  booking: Pick<BookingRow, "status">
): boolean {
  if (isBookingTerminalStatus(booking.status)) return false;

  if (booking.status === "pending") {
    return true;
  }

  if (isBookingLiveShiftStatus(booking.status)) {
    return true;
  }

  if (isBookingPendingStartStatus(booking.status)) {
    return true;
  }

  return false;
}

/** True when an early finish or cancellation should block session timer UI for today. */
export function doesBookingBlockSessionShiftUi(
  booking: Pick<BookingRow, "status"> | null | undefined
): boolean {
  if (!booking) return false;
  return isBookingTerminalStatus(booking.status);
}

/** True when a booking row still represents an active/in-progress shift (not terminal). */
export function isBookingLiveForSessionSync(
  booking: Pick<BookingRow, "status"> | null | undefined
): boolean {
  if (!booking) return false;
  if (isBookingTerminalStatus(booking.status)) return false;
  return isBookingEligibleForLiveShiftUi(booking);
}
