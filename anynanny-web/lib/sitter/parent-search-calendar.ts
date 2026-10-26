import {
  parentSearchLocalCalendarDate,
  parentSearchLocalDateTime
} from "@/lib/sitter/parent-search-datetime";

export type ParentSearchCalendarDay = {
  iso: string;
  inMonth: boolean;
  selectable: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day can be chosen when it is on or after the field's minimum date. */
export function isParentSearchCalendarDaySelectable(iso: string, minIso: string): boolean {
  if (!ISO_DATE.test(iso) || !ISO_DATE.test(minIso)) return false;
  if (!parentSearchLocalDateTime(iso, "12", "00")) return false;
  return iso >= minIso;
}

export function parentSearchCalendarMonthOf(iso: string): { year: number; monthIndex: number } | null {
  const parsed = parentSearchLocalDateTime(iso, "12", "00");
  if (!parsed) return null;
  return { year: parsed.getFullYear(), monthIndex: parsed.getMonth() };
}

/** Sunday-first weeks for one month, including the leading and trailing days needed to fill the grid. */
export function parentSearchCalendarWeeks(
  year: number,
  monthIndex: number,
  minIso: string
): ParentSearchCalendarDay[][] {
  const first = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - first.getDay());
  const weeks: ParentSearchCalendarDay[][] = [];

  for (let week = 0; week < 6; week += 1) {
    const days: ParentSearchCalendarDay[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + week * 7 + weekday);
      const iso = parentSearchLocalCalendarDate(date);
      days.push({
        iso,
        inMonth: date.getMonth() === monthIndex && date.getFullYear() === year,
        selectable: isParentSearchCalendarDaySelectable(iso, minIso)
      });
    }
    weeks.push(days);
  }

  while (weeks.length > 4 && weeks[weeks.length - 1].every((day) => !day.inMonth)) {
    weeks.pop();
  }
  return weeks;
}

export function parentSearchCalendarMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric"
  });
}

/** Narrow Hebrew weekday names, Sunday through Saturday. */
export function parentSearchWeekdayLabels(): string[] {
  const sunday = new Date(2026, 9, 25);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return date.toLocaleDateString("he-IL", { weekday: "narrow" });
  });
}

export function formatParentSearchDateLabel(iso: string): string {
  const parsed = parentSearchLocalDateTime(iso, "12", "00");
  if (!parsed) return "";
  return parsed.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}
