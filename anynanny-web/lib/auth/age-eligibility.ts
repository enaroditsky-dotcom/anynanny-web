import type { ProfileRole } from "@/lib/supabase/profiles";

export type AgeEligibilityRole = ProfileRole;

export const PARENT_MIN_AGE = 18;
export const SITTER_MIN_AGE = 16;

/** Landing page with parent/sitter login + registration. `manual=true` skips dashboard auto-redirect. */
export const ACCOUNT_TYPE_ENTRY_HREF = "/?manual=true";

export const AGE_GATE_COPY = {
  parent: {
    question: "האם גילך 18 ומעלה?",
    ineligible: "חשבון הורה זמין מגיל 18 ומעלה."
  },
  sitter: {
    question: "האם גילך 16 ומעלה?",
    ineligible: "חשבון נני זמין מגיל 16 ומעלה."
  }
} as const;

export const DOB_ELIGIBILITY_ERROR = {
  parent: "לפי תאריך הלידה שהוזן, לא ניתן לפתוח חשבון הורה לפני גיל 18.",
  sitter: "לפי תאריך הלידה שהוזן, לא ניתן לפתוח חשבון נני לפני גיל 16."
} as const;

export function minAgeForRole(role: AgeEligibilityRole): number {
  return role === "parent" ? PARENT_MIN_AGE : SITTER_MIN_AGE;
}

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

function calendarFromDate(date: Date): CalendarDate {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  };
}

function compareCalendarDate(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** Parse `YYYY-MM-DD` as a local calendar date. Does not use UTC midnight. */
export function parseIsoDateOnly(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim().slice(0, 10));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null;
  }

  return { year, month, day };
}

/**
 * Exact age in completed years on `asOf` (default: today).
 * Subtracts a year when the birthday has not yet occurred this calendar year.
 * Never uses `currentYear - birthYear` alone.
 */
export function getAgeOnDate(birthDate: string, asOf: Date = new Date()): number | null {
  const birth = parseIsoDateOnly(birthDate);
  if (!birth) return null;

  const today = calendarFromDate(asOf);
  if (compareCalendarDate(birth, today) > 0) return null;

  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) {
    age -= 1;
  }

  return age;
}

export function getAccountDobEligibilityError(
  role: AgeEligibilityRole,
  birthDate: string,
  asOf: Date = new Date()
): string | null {
  const trimmed = birthDate.trim();
  if (!trimmed) return "יש להזין תאריך לידה.";

  const age = getAgeOnDate(trimmed, asOf);
  if (age == null) return "יש להזין תאריך לידה תקין.";

  if (age < minAgeForRole(role)) {
    return DOB_ELIGIBILITY_ERROR[role];
  }

  return null;
}
