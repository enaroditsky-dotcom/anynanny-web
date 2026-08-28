import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { dateIsoInCalendarMonth } from "@/lib/bookings/focus-calendar-booking";

export type CalendarDateStatusFill = "none" | "closed" | "partial";

export function isCalendarToday(
  iso: string | null | undefined,
  todayIso: string = todayDateISO()
): boolean {
  const dateIso = String(iso ?? "").trim().slice(0, 10);
  return Boolean(dateIso) && dateIso === todayIso;
}

export function isCalendarDateSelected(
  iso: string | null | undefined,
  selectedIso: string | null | undefined
): boolean {
  const dateIso = String(iso ?? "").trim().slice(0, 10);
  const selected = String(selectedIso ?? "").trim().slice(0, 10);
  return Boolean(dateIso) && Boolean(selected) && dateIso === selected;
}

/**
 * Fresh calendar entry: focused booking date if present, otherwise today
 * when today falls in the displayed month.
 */
export function defaultCalendarSelectedIso(options: {
  focusDateIso?: string | null;
  month: number;
  year: number;
  todayIso?: string;
}): string | null {
  const focused = dateIsoInCalendarMonth(
    options.focusDateIso,
    options.month,
    options.year
  );
  if (focused) return focused;
  return dateIsoInCalendarMonth(
    options.todayIso ?? todayDateISO(),
    options.month,
    options.year
  );
}

export function calendarDateButtonAria(options: {
  iso: string;
  selectedIso: string | null | undefined;
  todayIso?: string;
}): {
  "aria-current": "date" | undefined;
  "aria-pressed": boolean;
} {
  return {
    "aria-current": isCalendarToday(options.iso, options.todayIso)
      ? "date"
      : undefined,
    "aria-pressed": isCalendarDateSelected(options.iso, options.selectedIso)
  };
}
