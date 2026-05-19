import type { BookingRow, BookingStatus } from "@/lib/bookings/constants";

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

export function isBookingTerminalStatus(status: BookingStatus | string): boolean {
  return BOOKING_TERMINAL_STATUSES.includes(status as BookingStatus);
}

export function isBookingLiveShiftStatus(status: BookingStatus | string): boolean {
  return BOOKING_LIVE_SHIFT_STATUSES.includes(status as BookingStatus);
}

export function isBookingPendingStartStatus(status: BookingStatus | string): boolean {
  return BOOKING_PENDING_START_STATUSES.includes(status as BookingStatus);
}

export function isNowWithinScheduledBookingWindow(
  booking: Pick<BookingRow, "start_time" | "end_time">,
  nowMs = Date.now()
): boolean {
  const startMs = new Date(booking.start_time).getTime();
  const endMs = new Date(booking.end_time).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  return nowMs >= startMs && nowMs <= endMs;
}

/**
 * Whether today's linked booking should drive Double-Shake / live timer UI.
 * Live statuses use DB status only; pending-start also requires the scheduled window.
 */
export function isBookingEligibleForLiveShiftUi(
  booking: Pick<BookingRow, "status" | "start_time" | "end_time">,
  nowMs = Date.now()
): boolean {
  if (isBookingTerminalStatus(booking.status)) return false;

  if (isBookingLiveShiftStatus(booking.status)) {
    return true;
  }

  if (isBookingPendingStartStatus(booking.status)) {
    return isNowWithinScheduledBookingWindow(booking, nowMs);
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
