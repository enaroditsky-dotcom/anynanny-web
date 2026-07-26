import type { BookingRow, BookingStatus } from "@/lib/bookings/constants";
import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/booking-status-normalize";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statuses that keep a shift linked after midnight until terminal close. */
export const IN_FLIGHT_BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

const TERMINAL_BOOKING_STATUSES = new Set<BookingStatus>(["completed", "cancelled", "rejected"]);

/** Local calendar date as YYYY-MM-DD (matches Postgres `date` column). */
export function todayDateISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isBookingDateToday(bookingDate: string): boolean {
  return bookingDate.slice(0, 10) === todayDateISO();
}

function padTimePart(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("T")) return t;
  return t.length <= 5 ? `${t}:00` : t;
}

/** Build a local ISO timestamp from `YYYY-MM-DD` + `HH:mm` / `HH:mm:ss` / full ISO. */
export function combineBookingDateAndTimeIso(bookingDate: string, timePart: string): string | null {
  const datePart = bookingDate.trim().slice(0, 10);
  const timeRaw = timePart.trim();
  if (!datePart || !timeRaw) return null;

  if (timeRaw.includes("T")) {
    const ms = new Date(timeRaw).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  const combined = `${datePart}T${padTimePart(timeRaw)}`;
  const ms = new Date(combined).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export type BookingWindowMs = {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
};

/**
 * Resolve scheduled shift bounds using full ISO timestamps.
 * Handles cross-midnight shifts by rolling `endMs` forward one day when needed.
 */
export function resolveBookingWindowMs(
  input: Pick<BookingRow, "booking_date" | "start_time" | "end_time">,
  nowMs = Date.now()
): BookingWindowMs | null {
  const startIsoDirect = combineBookingDateAndTimeIso(
    input.booking_date ?? todayDateISO(),
    input.start_time
  );
  const endIsoDirect = combineBookingDateAndTimeIso(
    input.booking_date ?? todayDateISO(),
    input.end_time
  );

  if (!startIsoDirect || !endIsoDirect) {
    const startMsRaw = new Date(input.start_time).getTime();
    const endMsRaw = new Date(input.end_time).getTime();
    if (!Number.isFinite(startMsRaw) || !Number.isFinite(endMsRaw)) {
      return null;
    }
    let endMs = endMsRaw;
    if (endMs <= startMsRaw) {
      endMs += MS_PER_DAY;
    }
    return {
      startMs: startMsRaw,
      endMs,
      startIso: new Date(startMsRaw).toISOString(),
      endIso: new Date(endMs).toISOString()
    };
  }

  let startMs = new Date(startIsoDirect).getTime();
  let endMs = new Date(endIsoDirect).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  if (endMs <= startMs) {
    endMs += MS_PER_DAY;
  }

  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString()
  };
}

export function isNowWithinBookingWindow(
  input: Pick<BookingRow, "booking_date" | "start_time" | "end_time">,
  nowMs = Date.now()
): boolean {
  const window = resolveBookingWindowMs(input, nowMs);
  if (!window) return false;
  return nowMs >= window.startMs && nowMs <= window.endMs;
}

export function isInFlightBookingStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized != null && IN_FLIGHT_BOOKING_STATUSES.includes(normalized);
}

export function isTerminalBookingStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized != null && TERMINAL_BOOKING_STATUSES.has(normalized);
}

/**
 * Booking row still relevant after midnight: in-flight status OR still inside scheduled ISO window.
 */
export function isBookingLiveAcrossMidnight(
  booking: Pick<BookingRow, "booking_date" | "start_time" | "end_time" | "status">,
  nowMs = Date.now()
): boolean {
  if (isTerminalBookingStatus(booking.status)) return false;
  if (isBookingDateToday(String(booking.booking_date ?? ""))) return true;

  const status = normalizeBookingStatus(booking.status);
  if (
    status === "parent_started" ||
    status === "sitter_started" ||
    status === "sitter_ended"
  ) {
    return true;
  }

  return isNowWithinBookingWindow(booking, nowMs);
}

/** Realtime/booking sync — accept today's rows, pending requests, and cross-midnight in-flight. */
export function isBookingRelevantForLiveSync(
  booking: Pick<BookingRow, "booking_date" | "start_time" | "end_time" | "status">
): boolean {
  const status = normalizeBookingStatus(booking.status);
  // Pending requests must always surface (any booking_date) so sitters see new asks live.
  if (status === "pending") return true;
  if (!booking.booking_date) return isInFlightBookingStatus(booking.status);
  if (isBookingDateToday(booking.booking_date)) return true;
  return isBookingLiveAcrossMidnight(booking);
}
