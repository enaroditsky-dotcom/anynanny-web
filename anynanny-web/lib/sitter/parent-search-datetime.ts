/**
 * Canonical parent-search datetime rule:
 * a selectable date/time is strictly in the future in the browser's local timezone.
 *
 * Dates are `YYYY-MM-DD` local calendar days. Clocks are local `HH:mm` with seconds 0.
 * This matches `buildLocalDateTimeIso` in parent-search-filters (local `Date` parts,
 * not `toISOString().slice(0, 10)`, which shifts the day in timezones ahead of UTC).
 */

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PART = /^\d{1,2}$/;

export function parentSearchLocalCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local `Date` at the chosen minute. Invalid calendar days return null. */
export function parentSearchLocalDateTime(
  day: string,
  hour: string,
  minute: string
): Date | null {
  const match = LOCAL_DATE.exec(day.trim());
  const hourText = hour.trim();
  const minuteText = minute.trim();
  if (!match || !CLOCK_PART.test(hourText) || !CLOCK_PART.test(minuteText)) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const hourNum = Number(hourText);
  const minuteNum = Number(minuteText);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  if (hourNum < 0 || hourNum > 23 || minuteNum < 0 || minuteNum > 59) return null;

  const local = new Date(year, month - 1, date, hourNum, minuteNum, 0, 0);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== date ||
    local.getHours() !== hourNum ||
    local.getMinutes() !== minuteNum
  ) {
    return null;
  }
  return local;
}

export function isParentSearchDateTimeStrictlyFuture(
  day: string,
  hour: string,
  minute: string,
  now = new Date()
): boolean {
  const local = parentSearchLocalDateTime(day, hour, minute);
  if (!local) return false;
  return local.getTime() > now.getTime();
}

/** Today and later calendar days. Today stays selectable even late in the evening. */
export function isParentSearchCalendarDateSelectable(day: string, now = new Date()): boolean {
  if (!parentSearchLocalDateTime(day, "12", "00")) return false;
  return day.trim() >= parentSearchLocalCalendarDate(now);
}

export function parentSearchEarliestSelectableDate(now = new Date()): string {
  return parentSearchLocalCalendarDate(now);
}

/** End date cannot be before today, and cannot be before the chosen start date. */
export function parentSearchEndDateMin(startDate: string, now = new Date()): string {
  const today = parentSearchLocalCalendarDate(now);
  const start = startDate.trim();
  if (start && start > today) return start;
  return today;
}

/**
 * Current hour stays enabled only while at least one minute in that hour is still
 * strictly in the future. Earlier hours today are fully past.
 */
export function isParentSearchHourSelectable(day: string, hour: string, now = new Date()): boolean {
  if (!isParentSearchCalendarDateSelectable(day, now)) return false;
  if (day.trim() > parentSearchLocalCalendarDate(now)) {
    return parentSearchLocalDateTime(day, hour, "00") != null;
  }
  for (let minute = 0; minute < 60; minute += 1) {
    if (isParentSearchDateTimeStrictlyFuture(day, hour, String(minute).padStart(2, "0"), now)) {
      return true;
    }
  }
  return false;
}

/**
 * Minutes are constrained once an hour is chosen.
 * With no hour yet, minute choices stay available so either dropdown can be used first.
 */
export function isParentSearchMinuteSelectable(
  day: string,
  hour: string,
  minute: string,
  now = new Date()
): boolean {
  if (!isParentSearchCalendarDateSelectable(day, now)) return false;
  if (!hour.trim()) return true;
  if (day.trim() > parentSearchLocalCalendarDate(now)) {
    return parentSearchLocalDateTime(day, hour, minute) != null;
  }
  return isParentSearchDateTimeStrictlyFuture(day, hour, minute, now);
}

/**
 * Drop a clock that is no longer strictly in the future after the calendar day changes.
 * A still-valid hour is kept and only the past minute is cleared.
 */
export function parentSearchClockAfterDateChange(
  day: string,
  hour: string,
  minute: string,
  now = new Date()
): { hour: string; minute: string } {
  if (!day.trim() || !isParentSearchCalendarDateSelectable(day, now)) {
    return { hour: "", minute: "" };
  }
  if (!hour.trim()) return { hour: "", minute };
  if (!isParentSearchHourSelectable(day, hour, now)) return { hour: "", minute: "" };
  if (minute.trim() && !isParentSearchMinuteSelectable(day, hour, minute, now)) {
    return { hour, minute: "" };
  }
  return { hour, minute };
}
