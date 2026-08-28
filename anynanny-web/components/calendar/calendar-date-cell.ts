import type { CalendarDateStatusFill } from "@/lib/bookings/calendar-date-cell";

/**
 * Shared calendar date-number visuals.
 * Today = soft filled circle (shape, not only color).
 * Selected = navy outline/ring (not the same filled blue).
 * Combined today+selected = pastel fill + navy ring on one circle.
 */
export const CALENDAR_TODAY_FILL_CLASS = "bg-sky-100";
export const CALENDAR_SELECTED_RING_CLASS =
  "ring-2 ring-navy-header ring-offset-1 ring-offset-white";
export const CALENDAR_TODAY_STATUS_RING_CLASS =
  "ring-2 ring-sky-300 ring-offset-1 ring-offset-white";

export function calendarDayNumberClass(options: {
  isToday: boolean;
  isSelected: boolean;
  statusFill?: CalendarDateStatusFill;
}): string {
  const statusFill = options.statusFill ?? "none";
  const parts = [
    "flex items-center justify-center rounded-full tabular-nums"
  ];

  if (statusFill === "closed") {
    parts.push("bg-red-500 text-white");
  } else if (statusFill === "partial") {
    parts.push("bg-yellow-400 text-slate-900");
  } else if (options.isToday) {
    parts.push(CALENDAR_TODAY_FILL_CLASS);
  }

  if (options.isSelected) {
    parts.push(CALENDAR_SELECTED_RING_CLASS);
  } else if (options.isToday && statusFill !== "none") {
    parts.push(CALENDAR_TODAY_STATUS_RING_CLASS);
  }

  return parts.join(" ");
}
