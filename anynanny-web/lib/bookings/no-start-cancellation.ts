/**
 * Read-only helpers for the scheduled no-start cancellation + shift-end reminder.
 * Canonical Double-Shake START is both start-shake timestamps. This module does
 * not write session state or change Double-Shake transitions.
 */

export const NO_START_CONFIRMATION_REASON = "no_start_confirmation" as const;
export const NO_START_CANCEL_LEAD_MINUTES = 30;
export const SHIFT_CANCELLED_NO_START_KIND = "shift_cancelled_no_start" as const;
export const SHIFT_CANCELLED_NO_START_TITLE = "המשמרת בוטלה";

export const NO_START_CANCEL_BODY =
  "המשמרת שתוכננה להתחיל בשעה {HH:mm} בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת.";

const AUTO_CANCEL_BOOKING_STATUSES = new Set(["approved", "sitter_started"]);
const TERMINAL_BOOKING_STATUSES = new Set(["cancelled", "completed", "rejected"]);

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

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

export function shouldAutoCancelApprovedBookingWithoutStart(input: {
  now: Date;
  scheduledStart: Date | string | null | undefined;
  bookingStatus?: string | null;
  cancelledAt?: string | null;
  sitterStartShake?: string | null;
  parentStartShake?: string | null;
}): boolean {
  const status = norm(input.bookingStatus);
  if (!AUTO_CANCEL_BOOKING_STATUSES.has(status)) return false;
  if (TERMINAL_BOOKING_STATUSES.has(status)) return false;
  if (String(input.cancelledAt ?? "").trim()) return false;
  if (isCanonicalDoubleShakeStartCompleted(input)) return false;
  const start = asDate(input.scheduledStart);
  if (!start) return false;
  const deadline = start.getTime() + NO_START_CANCEL_LEAD_MINUTES * 60 * 1000;
  return input.now.getTime() >= deadline;
}
