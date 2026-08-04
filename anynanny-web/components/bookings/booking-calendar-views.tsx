"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
import type { BookingStatus } from "@/lib/bookings/constants";
import { resolveBookingWindowMs, todayDateISO } from "@/lib/bookings/booking-date-utils";

export type CalendarShift = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerAddress?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  scheduleLabel: string;
};

export type CalendarViewMode = "today" | "week" | "month" | "all";

export const CALENDAR_VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: "today", label: "משמרות היום" },
  { value: "week", label: "משמרות השבוע" },
  { value: "month", label: "משמרות החודש" },
  { value: "all", label: "כל המשמרות שנקבעו" }
];

const HEBREW_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;
const HEBREW_WEEKDAY_FULL = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "יום שבת"] as const;

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const TIMELINE_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;

const DATE_WITH_SHIFT_CLASS = "font-bold text-red-800";
const DATE_WITHOUT_SHIFT_CLASS = "font-normal text-blue-600";

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר"
] as const;

const CALENDAR_YEAR_MIN = 2025;
const CALENDAR_YEAR_MAX = 2030;

export const CALENDAR_PERIOD_SELECT_CLASS =
  "min-w-0 flex-1 cursor-pointer appearance-none rounded-xl border border-navy-header/10 bg-white px-3 py-2 text-right text-sm font-semibold text-navy-header shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-navy-header/20";

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

function calendarYearOptions(): number[] {
  return Array.from(
    { length: CALENDAR_YEAR_MAX - CALENDAR_YEAR_MIN + 1 },
    (_, i) => CALENDAR_YEAR_MIN + i
  );
}

function getMonthRangeForPeriod(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`
  };
}

function formatIsraeliDate(dateStr: string): string {
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]!.slice(-2)}`;
}

function formatClockTime(iso: string): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function dateLabelClass(hasShifts: boolean): string {
  return hasShifts ? DATE_WITH_SHIFT_CLASS : DATE_WITHOUT_SHIFT_CLASS;
}

function embeddedEmptyHint(view: CalendarViewMode): string {
  switch (view) {
    case "today":
      return "אין משמרות להיום";
    case "week":
      return "אין משמרות השבוע";
    case "month":
      return "אין משמרות החודש";
    case "all":
      return "אין משמרות שנקבעו";
    default:
      return "אין משמרות להצגה";
  }
}

function shiftDateKey(shift: CalendarShift): string {
  return shift.bookingDate.slice(0, 10);
}

/**
 * Scheduled calendar ("משמרות שנקבעו") — upcoming or still-active only.
 * Past end times and completed/cancelled bookings belong in history.
 */
export function isUpcomingOrActiveCalendarShift(
  shift: Pick<CalendarShift, "bookingDate" | "startTime" | "endTime" | "status">,
  nowMs = Date.now()
): boolean {
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
    // Fallback when times can't be parsed: keep today and future booking dates.
    return shift.bookingDate.slice(0, 10) >= todayDateISO();
  }

  return window.endMs >= nowMs;
}

export function buildCalendarShiftsByDate(shifts: CalendarShift[]): Map<string, CalendarShift[]> {
  const map = new Map<string, CalendarShift[]>();
  for (const shift of shifts) {
    const key = shiftDateKey(shift);
    const list = map.get(key) ?? [];
    list.push(shift);
    map.set(key, list);
  }
  return map;
}

export function filterCalendarShiftsByView(
  shifts: CalendarShift[],
  view: CalendarViewMode,
  period?: { month: number; year: number },
  nowMs = Date.now()
): CalendarShift[] {
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

function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "ממתין לאישור";
    case "approved":
      return "מתוזמן";
    case "sitter_started":
      return "הבייביסיטר התחילה";
    case "parent_started":
      return "משמרת פעילה";
    case "sitter_ended":
      return "ממתין לסיום";
    case "completed":
      return "הושלם";
    default:
      return "בפעילות";
  }
}

function statusBadgeClass(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "approved":
      return "bg-emerald-50 text-emerald-800 border-emerald-100";
    case "sitter_started":
    case "parent_started":
      return "bg-amber-50 text-amber-800 border-amber-100";
    case "sitter_ended":
      return "bg-rose-50 text-rose-800 border-rose-100";
    case "completed":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function shiftAccentClass(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "border-r-blue-500 bg-blue-50/90";
    case "approved":
      return "border-r-emerald-500 bg-emerald-50/90";
    case "sitter_started":
    case "parent_started":
      return "border-r-amber-500 bg-amber-50/90";
    case "sitter_ended":
      return "border-r-rose-500 bg-rose-50/90";
    case "completed":
      return "border-r-slate-400 bg-slate-50/90";
    default:
      return "border-r-navy-header bg-[#FDFBF6]";
  }
}

function minutesFromDayStart(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes());
}

function shiftTimelineStyle(startTime: string, endTime: string): { top: string; height: string } {
  const startMin = Math.min(TIMELINE_MINUTES, minutesFromDayStart(startTime));
  const endMin = Math.min(TIMELINE_MINUTES, Math.max(startMin + 30, minutesFromDayStart(endTime)));
  const top = (startMin / TIMELINE_MINUTES) * 100;
  const height = Math.max(10, ((endMin - startMin) / TIMELINE_MINUTES) * 100);
  return { top: `${top}%`, height: `${height}%` };
}

type CalendarViewsContext = {
  profileHref?: (shift: CalendarShift) => string | null;
  profileLinkLabel?: string;
};

function ShiftCard({
  shift,
  compact = false,
  profileHref,
  profileLinkLabel
}: {
  shift: CalendarShift;
  compact?: boolean;
  profileHref?: (shift: CalendarShift) => string | null;
  profileLinkLabel?: string;
}) {
  const href = profileHref?.(shift) ?? null;

  return (
    <div
      className={`rounded-2xl border border-slate-100 p-3 text-right shadow-sm ${shiftAccentClass(shift.status)} border-r-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold whitespace-nowrap ${statusBadgeClass(shift.status)}`}
        >
          {bookingStatusLabel(shift.status)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-bold text-[#001F3F] ${compact ? "text-xs" : "text-sm"}`}>
            {shift.partnerName}
          </p>
          {shift.partnerAddress?.trim() ? (
            <p className="mt-0.5 inline-flex max-w-full flex-row-reverse items-start gap-1 text-[11px] font-medium leading-snug text-slate-700">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 text-right">{shift.partnerAddress.trim()}</span>
            </p>
          ) : null}
          <p className="mt-0.5 text-[11px] font-medium text-slate-600 tabular-nums">{shift.scheduleLabel}</p>
        </div>
      </div>
      {!compact ? (
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
          {href && profileLinkLabel ? (
            <Link href={href} className="font-bold text-navy-header underline">
              {profileLinkLabel}
            </Link>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="h-3 w-3" aria-hidden />
            {formatClockTime(shift.startTime)} – {formatClockTime(shift.endTime)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function CalendarShell({
  title,
  titleControl,
  subtitle,
  children,
  className = ""
}: {
  title?: string;
  titleControl?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ${className}`.trim()}
    >
      <div className="shrink-0 border-b border-slate-100 px-4 py-3 text-right">
        {titleControl ?? (title ? <p className="text-sm font-bold text-navy-header">{title}</p> : null)}
        {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SelectChevron() {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
      <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
      </svg>
    </div>
  );
}

export function TodayGridView({
  shifts,
  profileHref,
  profileLinkLabel
}: CalendarViewsContext & { shifts: CalendarShift[] }) {
  const today = todayDateISO();
  const hasShifts = shifts.length > 0;
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);
  const slotCount = hours.length;
  const timelineHeightRem = slotCount * 3.5;

  return (
    <CalendarShell
      className="h-full"
      title={`תצוגת יום · ${formatIsraeliDate(today)}`}
      subtitle={hasShifts ? `${shifts.length} משמרות היום` : embeddedEmptyHint("today")}
    >
      <div className="shrink-0 px-4 py-2 text-right">
        <p className={`text-lg tabular-nums ${dateLabelClass(hasShifts)}`}>{formatIsraeliDate(today)}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100">
        <div className="relative flex" style={{ minHeight: `${timelineHeightRem}rem` }}>
          <div className="sticky right-0 z-[1] w-11 shrink-0 border-l border-slate-100 bg-slate-50/95">
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex h-14 items-start justify-center pt-1 text-[9px] font-semibold text-slate-400"
              >
                {pad2(hour)}:00
              </div>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 bg-[#FDFBF6]/40">
            {hours.map((hour) => (
              <div key={hour} className="h-14 border-b border-slate-100/80" />
            ))}
            {shifts.map((shift) => {
              const style = shiftTimelineStyle(shift.startTime, shift.endTime);
              return (
                <div
                  key={shift.id}
                  className={`absolute inset-x-1.5 overflow-hidden rounded-lg border border-white/80 px-2 py-1 shadow-sm ${shiftAccentClass(shift.status)} border-r-4`}
                  style={style}
                >
                  <p className="truncate text-[10px] font-bold text-[#001F3F]">{shift.partnerName}</p>
                  <p className="truncate text-[9px] text-slate-600 tabular-nums">
                    {formatClockTime(shift.startTime)} – {formatClockTime(shift.endTime)}
                  </p>
                </div>
              );
            })}
            {!hasShifts ? (
              <p
                className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs ${DATE_WITHOUT_SHIFT_CLASS}`}
              >
                {embeddedEmptyHint("today")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </CalendarShell>
  );
}

export function WeekGridView({
  shifts,
  profileHref,
  profileLinkLabel
}: CalendarViewsContext & { shifts: CalendarShift[] }) {
  const { start } = getWeekRange();
  const startDate = new Date(`${start}T12:00:00`);
  const [selectedIso, setSelectedIso] = useState(todayDateISO());
  const shiftsByDate = useMemo(() => buildCalendarShiftsByDate(shifts), [shifts]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const iso = toDateISO(d);
        const dayShifts = shiftsByDate.get(iso) ?? [];
        return {
          iso,
          dayNum: d.getDate(),
          weekdayFull: HEBREW_WEEKDAY_FULL[d.getDay()]!,
          hasShifts: dayShifts.length > 0,
          shifts: dayShifts
        };
      }),
    [startDate, shiftsByDate]
  );

  const selectedShifts = shiftsByDate.get(selectedIso) ?? [];
  const selectedDay = days.find((d) => d.iso === selectedIso);
  const weekHasShifts = shifts.length > 0;

  return (
    <CalendarShell
      className="h-full"
      title="תצוגת שבוע"
      subtitle={weekHasShifts ? `${shifts.length} משמרות השבוע` : embeddedEmptyHint("week")}
    >
      <div className="shrink-0 grid grid-cols-7 gap-1 border-b border-slate-100 px-2 py-2 text-center text-[10px] font-bold text-slate-400">
        {HEBREW_WEEKDAYS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="shrink-0 grid grid-cols-7 gap-1 p-2">
        {days.map((day) => (
          <button
            key={day.iso}
            type="button"
            onClick={() => setSelectedIso(day.iso)}
            className={`flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl border p-1 transition-colors ${
              selectedIso === day.iso
                ? "border-navy-header/30 bg-[#FDFBF6] ring-1 ring-navy-header/15"
                : "border-slate-100 bg-white hover:bg-slate-50"
            }`}
          >
            <span className={`text-sm tabular-nums ${dateLabelClass(day.hasShifts)}`}>{day.dayNum}</span>
            {day.hasShifts ? (
              <span className="mt-0.5 text-[8px] font-bold text-red-800">{day.shifts.length}</span>
            ) : (
              <span className="mt-0.5 text-[8px] text-blue-600">—</span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 px-3 py-3">
        <p className="mb-2 text-right text-xs">
          <span className={dateLabelClass(selectedShifts.length > 0)}>
            {selectedDay?.weekdayFull} · {formatIsraeliDate(selectedIso)}
          </span>
        </p>
        {selectedShifts.length === 0 ? (
          <p className={`py-2 text-center text-xs ${DATE_WITHOUT_SHIFT_CLASS}`}>אין משמרות ביום זה</p>
        ) : (
          <div className="space-y-2">
            {selectedShifts.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                compact
                profileHref={profileHref}
                profileLinkLabel={profileLinkLabel}
              />
            ))}
          </div>
        )}
      </div>
    </CalendarShell>
  );
}

export function MonthGridView({
  shifts,
  currentMonth,
  currentYear,
  onMonthChange,
  onYearChange,
  profileHref,
  profileLinkLabel
}: CalendarViewsContext & {
  shifts: CalendarShift[];
  currentMonth: number;
  currentYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
}) {
  const firstDay = new Date(currentYear, currentMonth - 1, 1);
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const startOffset = firstDay.getDay();
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const shiftsByDate = useMemo(() => buildCalendarShiftsByDate(shifts), [shifts]);
  const monthHasShifts = shifts.length > 0;

  useEffect(() => {
    setSelectedIso(null);
  }, [currentMonth, currentYear]);

  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, iso: null });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      iso: `${currentYear}-${pad2(currentMonth)}-${pad2(day)}`
    });
  }

  const selectedShifts = selectedIso ? (shiftsByDate.get(selectedIso) ?? []) : [];

  const periodHeader = (
    <div className="flex flex-row-reverse items-center justify-center gap-2">
      <div className="relative min-w-0 flex-1">
        <select
          aria-label="בחירת חודש"
          value={currentMonth}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className={CALENDAR_PERIOD_SELECT_CLASS}
        >
          {HEBREW_MONTHS.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
      <div className="relative w-[5.5rem] shrink-0">
        <select
          aria-label="בחירת שנה"
          value={currentYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className={CALENDAR_PERIOD_SELECT_CLASS}
        >
          {calendarYearOptions().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
    </div>
  );

  return (
    <CalendarShell
      className="h-full"
      titleControl={periodHeader}
      subtitle={monthHasShifts ? `${shifts.length} משמרות החודש` : embeddedEmptyHint("month")}
    >
      <div className="shrink-0 grid grid-cols-7 gap-1 border-b border-slate-100 px-2 py-2 text-center text-[10px] font-bold text-slate-400">
        {HEBREW_WEEKDAYS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="shrink-0 grid grid-cols-7 gap-1 p-2">
        {cells.map((cell, index) => {
          if (!cell.day || !cell.iso) {
            return <div key={`empty-${index}`} className="min-h-[3.25rem]" />;
          }
          const dayShifts = shiftsByDate.get(cell.iso) ?? [];
          const hasShifts = dayShifts.length > 0;
          const isSelected = selectedIso === cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => setSelectedIso((prev) => (prev === cell.iso ? null : cell.iso))}
              className={`min-h-[3.25rem] rounded-xl border p-1 text-center transition-colors ${
                isSelected
                  ? "border-navy-header/30 bg-[#FDFBF6] ring-1 ring-navy-header/15"
                  : "border-slate-100 bg-white hover:bg-slate-50"
              }`}
            >
              <p className={`text-sm tabular-nums ${dateLabelClass(hasShifts)}`}>{cell.day}</p>
              {hasShifts ? (
                <p className="truncate text-[8px] font-bold text-red-800">{dayShifts.length} משמרות</p>
              ) : (
                <p className="text-[8px] text-blue-600">—</p>
              )}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 px-3 py-3">
        {selectedIso ? (
          <>
            <p className="mb-2 text-right text-xs">
              <span className={dateLabelClass(selectedShifts.length > 0)}>
                {formatIsraeliDate(selectedIso)}
              </span>
            </p>
            {selectedShifts.length === 0 ? (
              <p className={`py-2 text-center text-xs ${DATE_WITHOUT_SHIFT_CLASS}`}>אין משמרות בתאריך זה</p>
            ) : (
              <div className="space-y-2">
                {selectedShifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    compact
                    profileHref={profileHref}
                    profileLinkLabel={profileLinkLabel}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className={`py-1 text-center text-xs ${monthHasShifts ? "text-slate-500" : DATE_WITHOUT_SHIFT_CLASS}`}>
            {monthHasShifts ? "לחצו על תאריך לצפייה במשמרות" : embeddedEmptyHint("month")}
          </p>
        )}
      </div>
    </CalendarShell>
  );
}

function isoDateFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function resolveShiftScheduleLabels(
  shift: Pick<CalendarShift, "bookingDate" | "startTime" | "endTime">
): {
  startTimeLabel: string;
  startDateLabel: string;
  endTimeLabel: string;
  endDateLabel: string;
} {
  const window = resolveBookingWindowMs({
    booking_date: shift.bookingDate,
    start_time: shift.startTime,
    end_time: shift.endTime
  });
  const fallbackDate = formatIsraeliDate(shift.bookingDate);

  if (!window) {
    return {
      startTimeLabel: formatClockTime(shift.startTime),
      startDateLabel: fallbackDate,
      endTimeLabel: formatClockTime(shift.endTime),
      endDateLabel: fallbackDate
    };
  }

  const timeFmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

  return {
    startTimeLabel: new Date(window.startMs).toLocaleTimeString("he-IL", timeFmt),
    startDateLabel: formatIsraeliDate(shift.bookingDate.slice(0, 10)),
    endTimeLabel: new Date(window.endMs).toLocaleTimeString("he-IL", timeFmt),
    endDateLabel: formatIsraeliDate(isoDateFromMs(window.endMs))
  };
}

function AllShiftsListCard({
  shift,
  profileHref,
  profileLinkLabel
}: CalendarViewsContext & { shift: CalendarShift }) {
  const labels = resolveShiftScheduleLabels(shift);
  const href = profileHref?.(shift) ?? null;

  return (
    <li
      className={`rounded-2xl border border-slate-100 p-4 text-right shadow-sm ${shiftAccentClass(shift.status)} border-r-4`}
    >
      <div className="flex flex-row-reverse items-start justify-between gap-2">
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold whitespace-nowrap ${statusBadgeClass(shift.status)}`}
        >
          {bookingStatusLabel(shift.status)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[#001F3F]">{shift.partnerName}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/90 p-3">
        <div className="flex flex-col gap-1 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">תחילה</p>
          <span className="text-lg font-bold tabular-nums text-[#001F3F]">{labels.startTimeLabel}</span>
          <span className="text-sm font-semibold tabular-nums text-slate-700">{labels.startDateLabel}</span>
        </div>

        <div className="flex flex-col gap-1 border-r border-slate-200 pr-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">סיום</p>
          <span className="text-lg font-bold tabular-nums text-[#001F3F]">{labels.endTimeLabel}</span>
          <span className="text-sm font-semibold tabular-nums text-slate-700">{labels.endDateLabel}</span>
        </div>
      </div>

      {href && profileLinkLabel ? (
        <div className="mt-3 flex flex-row-reverse items-center justify-between text-[10px] text-slate-500">
          <Link href={href} className="font-bold text-navy-header underline">
            {profileLinkLabel}
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export function AllShiftsListView({
  shifts,
  profileHref,
  profileLinkLabel
}: CalendarViewsContext & { shifts: CalendarShift[] }) {
  const hasShifts = shifts.length > 0;
  const sortedShifts = useMemo(() => {
    return [...shifts].sort((a, b) => {
      const aWindow = resolveBookingWindowMs({
        booking_date: a.bookingDate,
        start_time: a.startTime,
        end_time: a.endTime
      });
      const bWindow = resolveBookingWindowMs({
        booking_date: b.bookingDate,
        start_time: b.startTime,
        end_time: b.endTime
      });
      return (bWindow?.startMs ?? 0) - (aWindow?.startMs ?? 0);
    });
  }, [shifts]);

  return (
    <CalendarShell
      className="h-full"
      title="כל המשמרות שנקבעו"
      subtitle={hasShifts ? `${shifts.length} משמרות` : embeddedEmptyHint("all")}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {!hasShifts ? (
          <p className={`py-6 text-center text-xs ${DATE_WITHOUT_SHIFT_CLASS}`}>{embeddedEmptyHint("all")}</p>
        ) : (
          <ul className="space-y-3">
            {sortedShifts.map((shift) => (
              <AllShiftsListCard
                key={shift.id}
                shift={shift}
                profileHref={profileHref}
                profileLinkLabel={profileLinkLabel}
              />
            ))}
          </ul>
        )}
      </div>
    </CalendarShell>
  );
}
