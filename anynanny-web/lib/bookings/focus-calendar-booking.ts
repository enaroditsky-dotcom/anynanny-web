import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { normalizeBookingStatus } from "@/lib/bookings/booking-status-normalize";
import {
  isPendingSitterApprovalCalendarShift,
  type CalendarViewMode
} from "@/lib/bookings/calendar-shift-filters";

const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseFocusBookingId(raw: string | null | undefined): string | null {
  const id = String(raw ?? "").trim();
  return id || null;
}

export function calendarBookingHref(pathname: string, bookingId?: string | null): string {
  const id = String(bookingId ?? "").trim();
  if (!id) return pathname;
  return `${pathname}?bookingId=${encodeURIComponent(id)}`;
}

export function calendarBookingDomId(bookingId: string): string {
  return `calendar-booking-${bookingId}`;
}

export function findCalendarShiftById<T extends { id: string }>(
  shifts: readonly T[],
  bookingId: string | null | undefined
): T | null {
  const id = parseFocusBookingId(bookingId);
  if (!id) return null;
  return shifts.find((shift) => shift.id === id) ?? null;
}

export function dateIsoInCalendarMonth(
  iso: string | null | undefined,
  month: number,
  year: number
): string | null {
  const dateIso = String(iso ?? "").trim().slice(0, 10);
  const match = DATE_ISO_RE.exec(dateIso);
  if (!match) return null;
  if (Number(match[1]) !== year || Number(match[2]) !== month) return null;
  return dateIso;
}

export type CalendarFocusTarget = {
  viewMode: CalendarViewMode;
  month: number;
  year: number;
  dateIso: string;
};

export function resolveCalendarFocusForShift(
  shift: { bookingDate: string; status: string },
  options: {
    viewOptions: readonly CalendarViewMode[];
    todayIso?: string;
  }
): CalendarFocusTarget {
  const dateIso = String(shift.bookingDate ?? "").trim().slice(0, 10);
  const match = DATE_ISO_RE.exec(dateIso);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  const views = new Set(options.viewOptions);
  const parsedDateIso = match ? dateIso : "";

  if (
    isPendingSitterApprovalCalendarShift(normalizeBookingStatus({ name: shift.status })) &&
    views.has("pending_sitter_approval")
  ) {
    return { viewMode: "pending_sitter_approval", month, year, dateIso: parsedDateIso };
  }

  const todayIso = options.todayIso ?? todayDateISO();
  if (parsedDateIso && parsedDateIso === todayIso && views.has("today")) {
    return { viewMode: "today", month, year, dateIso: parsedDateIso };
  }

  if (parsedDateIso && views.has("month")) {
    return { viewMode: "month", month, year, dateIso: parsedDateIso };
  }

  if (views.has("all")) {
    return { viewMode: "all", month, year, dateIso: parsedDateIso };
  }

  return {
    viewMode: options.viewOptions[0] ?? "today",
    month,
    year,
    dateIso: parsedDateIso
  };
}

export function calendarStateForFocusBooking<T extends { id: string; bookingDate: string; status: string }>(
  shifts: readonly T[],
  bookingId: string | null | undefined,
  options: {
    viewOptions: readonly CalendarViewMode[];
    todayIso?: string;
  }
): (CalendarFocusTarget & { highlightedBookingId: string }) | null {
  const shift = findCalendarShiftById(shifts, bookingId);
  if (!shift) return null;
  return {
    ...resolveCalendarFocusForShift(shift, options),
    highlightedBookingId: shift.id
  };
}


