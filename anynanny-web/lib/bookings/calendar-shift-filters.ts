import { todayDateISO, resolveBookingWindowMs } from "@/lib/bookings/booking-date-utils";
import { isSitterBookingAwaitingApprovalStatus } from "@/lib/bookings/booking-realtime-handler";
import type { BookingStatus } from "@/lib/bookings/constants";
import type { BookingStatusInput } from "@/lib/bookings/booking-status-normalize";

/**
 * Canonical booking status for a parent request still waiting on the sitter.
 * Alias `requested` normalizes to `pending`. This is NOT session
 * `pending_sitter_approval` (awaiting sitter start of an already-approved shift).
 */
export const PARENT_PENDING_SITTER_APPROVAL_STATUS = "pending" satisfies BookingStatus;

export type CalendarShiftFilterFields = {
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
};

export type CalendarViewMode = "today" | "week" | "month" | "all" | "pending_sitter_approval";

export const CALENDAR_VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: "today", label: "משמרות היום" },
  { value: "week", label: "משמרות השבוע" },
  { value: "month", label: "משמרות החודש" },
  { value: "all", label: "כל המשמרות שנקבעו" }
];

export const PARENT_CALENDAR_VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  ...CALENDAR_VIEW_OPTIONS,
  { value: "pending_sitter_approval", label: "משמרות שממתינות לאישור בייביסיטר" }
];

/** Confirmed / in-progress bookings that belong on Today/Week/Month/All. */
export const PARENT_CALENDAR_CONFIRMED_STATUSES: BookingStatus[] = [
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

/** Combined load set: pending requests + confirmed shifts. */
export const PARENT_CALENDAR_LOAD_STATUSES: BookingStatus[] = [
  PARENT_PENDING_SITTER_APPROVAL_STATUS,
  ...PARENT_CALENDAR_CONFIRMED_STATUSES
];

export function isPendingSitterApprovalCalendarShift(status: BookingStatusInput): boolean {
  return isSitterBookingAwaitingApprovalStatus(status);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getWeekRange(reference = new Date()): { start: string; end: string } {
  const d = new Date(reference);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toDateISO(start), end: toDateISO(end) };
}

function getMonthRangeForPeriod(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`
  };
}

function shiftDateKey(shift: Pick<CalendarShiftFilterFields, "bookingDate">): string {
  return shift.bookingDate.slice(0, 10);
}

/**
 * Scheduled calendar ("משמרות שנקבעו") — upcoming or still-active confirmed shifts only.
 * Pending sitter-approval requests are excluded so they never mix into confirmed views.
 * Past end times and completed/cancelled bookings belong in history.
 */
export function isUpcomingOrActiveCalendarShift(
  shift: CalendarShiftFilterFields,
  nowMs = Date.now()
): boolean {
  if (isPendingSitterApprovalCalendarShift(shift.status)) {
    return false;
  }

  const status = String(shift.status ?? "").trim().toLowerCase();
  if (status === "completed" || status === "cancelled" || status === "rejected") {
    return false;
  }

  const window = resolveBookingWindowMs(
    {
      booking_date: shift.bookingDate,
      start_time: shift.startTime,
      end_time: shift.endTime
    },
    nowMs
  );

  if (!window) {
    return shift.bookingDate.slice(0, 10) >= todayDateISO();
  }

  return window.endMs >= nowMs;
}

/** Parent calendar dataset: pending requests (any date) plus confirmed upcoming/active shifts. */
export function isVisibleParentCalendarShift(
  shift: CalendarShiftFilterFields,
  nowMs = Date.now()
): boolean {
  return isPendingSitterApprovalCalendarShift(shift.status) || isUpcomingOrActiveCalendarShift(shift, nowMs);
}

export function filterCalendarShiftsByView<T extends CalendarShiftFilterFields>(
  shifts: T[],
  view: CalendarViewMode,
  period?: { month: number; year: number },
  nowMs = Date.now()
): T[] {
  if (view === "pending_sitter_approval") {
    return shifts.filter((s) => isPendingSitterApprovalCalendarShift(s.status));
  }

  const relevant = shifts.filter((s) => isUpcomingOrActiveCalendarShift(s, nowMs));
  const today = todayDateISO();
  switch (view) {
    case "today":
      return relevant.filter((s) => shiftDateKey(s) === today);
    case "week": {
      const { start, end } = getWeekRange();
      return relevant.filter((s) => {
        const d = shiftDateKey(s);
        return d >= start && d <= end;
      });
    }
    case "month": {
      const month = period?.month ?? new Date().getMonth() + 1;
      const year = period?.year ?? new Date().getFullYear();
      const { start, end } = getMonthRangeForPeriod(year, month);
      return relevant.filter((s) => {
        const d = shiftDateKey(s);
        return d >= start && d <= end;
      });
    }
    case "all":
      return relevant;
    default:
      return relevant;
  }
}

export function calendarViewEmptyHint(view: CalendarViewMode): string {
  switch (view) {
    case "today":
      return "אין משמרות להיום";
    case "week":
      return "אין משמרות השבוע";
    case "month":
      return "אין משמרות החודש";
    case "all":
      return "אין משמרות שנקבעו";
    case "pending_sitter_approval":
      return "אין משמרות שממתינות לאישור בייביסיטר";
    default:
      return "אין משמרות להצגה";
  }
}
