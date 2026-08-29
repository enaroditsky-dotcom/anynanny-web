/**
 * Legacy no-start auto-cancel helpers + Double-Shake start detection.
 * Approved unstarted bookings are no longer auto-cancelled at +30 minutes.
 * After scheduled end they enter awaiting_missed_shift_reason instead.
 * Canonical Double-Shake START is both start-shake timestamps. This module does
 * not write session state or change Double-Shake transitions.
 */

export const NO_START_CONFIRMATION_REASON = "no_start_confirmation" as const;
/** @deprecated +30-minute no-start auto-cancel is disabled. Kept for historical copy/tests. */
export const NO_START_CANCEL_LEAD_MINUTES = 30;
export const SHIFT_CANCELLED_NO_START_KIND = "shift_cancelled_no_start" as const;
export const SHIFT_CANCELLED_NO_START_TITLE = "המשמרת בוטלה";

export const NO_START_CANCEL_BODY =
  "המשמרת שתוכננה להתחיל בשעה {HH:mm} בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת.";

function hasTimestamp(value: string | null | undefined): boolean {
  return String(value ?? "").trim() !== "";
}

/** Fully completed canonical Double-Shake START: both start shakes are present. */
export function isCanonicalDoubleShakeStartCompleted(input: {
  sitterStartShake?: string | null;
  parentStartShake?: string | null;
}): boolean {
  return hasTimestamp(input.sitterStartShake) && hasTimestamp(input.parentStartShake);
}

export function formatNoStartCancellationBody(timeLabel: string): string {
  return `המשמרת שתוכננה להתחיל בשעה ${timeLabel} בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת.`;
}

/**
 * Always false. The +30-minute no-start auto-cancel rule is retired.
 * Unstarted approved bookings stay approved until scheduled end.
 */
export function shouldAutoCancelApprovedBookingWithoutStart(_input: {
  now: Date;
  scheduledStart: Date | string | null | undefined;
  bookingStatus?: string | null;
  cancelledAt?: string | null;
  sitterStartShake?: string | null;
  parentStartShake?: string | null;
}): boolean {
  return false;
}
