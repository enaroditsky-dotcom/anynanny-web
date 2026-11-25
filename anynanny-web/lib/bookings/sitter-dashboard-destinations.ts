/** Existing sitter shift board. `view=pending` opens the current "ממתינות לאישור" list. */
export const SITTER_PENDING_REQUESTS_HREF = "/sitter/shifts?view=pending";

/** Existing shift calendar, opened on the current "משמרות השבוע" filter. */
export const SITTER_UPCOMING_WEEK_SHIFTS_HREF = "/sitter/shifts?view=calendar&range=week";

export type SitterShiftsBoardView = "pending" | "calendar" | "past";
export type SitterCalendarRange = "today" | "week" | "month" | "all";

export function sitterShiftsBoardViewFromParam(raw: string | null | undefined): SitterShiftsBoardView {
  if (raw === "pending" || raw === "past" || raw === "calendar") return raw;
  return "calendar";
}

export function sitterCalendarRangeFromParam(raw: string | null | undefined): SitterCalendarRange | null {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "all") return raw;
  return null;
}
