import { validateShiftWindow } from "@/lib/shift-requests/create-shift-request";
import {
  buildSearchEndTimeIso,
  buildSearchStartTimeIso,
  hasExplicitRequestedShiftFields,
  normalizeParentSearchFilters,
  parseFiltersFromSearchParams,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";

/**
 * Canonical requested-shift window used by search matching (`p_start_time` / `p_end_time`)
 * and by booking insert (`bookings.start_time` / `bookings.end_time`).
 *
 * Same shape as {@link validateShiftWindow} success — do not introduce a parallel startAt/endAt type.
 */
export type RequestedShiftWindow = {
  startIso: string;
  endIso: string;
  startDate: string;
  endDate: string;
};

function padClock(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local `HH:mm` from an ISO timestamp produced by the search builders. */
export function formatShiftClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${padClock(date.getHours())}:${padClock(date.getMinutes())}`;
}

export function formatRequestedShiftDateLabel(startDate: string): string {
  const parsed = new Date(`${startDate.trim()}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return startDate;
  return parsed.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function formatRequestedShiftTimeRange(startIso: string, endIso: string): string {
  const start = formatShiftClock(startIso);
  const end = formatShiftClock(endIso);
  if (!start || !end) return "";
  return `${start}–${end}`;
}

/**
 * Build the bookable window from explicit parent-search date/time fields.
 *
 * Uses {@link buildSearchStartTimeIso} / {@link buildSearchEndTimeIso} so booking timestamps
 * are the same normalized values sent to `list_public_sitters_search`.
 */
export function requestedShiftFromFilters(filters: ParentSearchFilters): RequestedShiftWindow | null {
  if (!hasExplicitRequestedShiftFields(filters)) return null;

  const safe = normalizeParentSearchFilters(filters);
  const startDate = safe.searchDate.trim();
  const endDate = (safe.searchEndDate || startDate).trim();
  const startIso = buildSearchStartTimeIso(safe);
  const endIso = buildSearchEndTimeIso(safe);
  if (!startIso || !endIso) return null;

  return { startIso, endIso, startDate, endDate };
}

export function requestedShiftFromSearchParams(
  params: Pick<URLSearchParams, "get">
): RequestedShiftWindow | null {
  return requestedShiftFromFilters(parseFiltersFromSearchParams(params));
}

/** Validate a locked search window before insert (past day, inverted range). */
export function validateRequestedShiftWindow(
  window: RequestedShiftWindow
): RequestedShiftWindow | { error: string } {
  const startHour = formatShiftClock(window.startIso).slice(0, 2);
  const startMinute = formatShiftClock(window.startIso).slice(3, 5);
  const endHour = formatShiftClock(window.endIso).slice(0, 2);
  const endMinute = formatShiftClock(window.endIso).slice(3, 5);

  if (!startHour || !startMinute || !endHour || !endMinute) {
    return { error: "תאריך או שעה לא תקינים" };
  }

  const validated = validateShiftWindow({
    shiftDate: window.startDate,
    shiftEndDate: window.endDate,
    startHour,
    startMinute,
    endHour,
    endMinute
  });
  if ("error" in validated) return validated;

  return {
    startIso: window.startIso,
    endIso: window.endIso,
    startDate: validated.startDate,
    endDate: validated.endDate
  };
}
