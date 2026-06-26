"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type ParentCalendarShift = {
  id: string;
  sitterId: string;
  sitterName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  scheduleLabel: string;
};

type CalendarViewMode = "today" | "week" | "month" | "all";

const VIEW_OPTIONS: { value: CalendarViewMode; label: string }[] = [
  { value: "today", label: "משמרות היום" },
  { value: "week", label: "משמרות השבוע" },
  { value: "month", label: "משמרות החודש" },
  { value: "all", label: "כל המשמרות שנקבעו" }
];

const BOOKED_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended",
  "completed"
];

const HEBREW_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;
const HEBREW_WEEKDAY_FULL = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "יום שבת"] as const;

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const TIMELINE_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;

const DATE_WITH_SHIFT_CLASS = "font-bold text-red-800";
const DATE_WITHOUT_SHIFT_CLASS = "font-normal text-blue-600";

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

function getMonthRange(reference = new Date()): { start: string; end: string } {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    start: `${y}-${pad2(m + 1)}-01`,
    end: `${y}-${pad2(m + 1)}-${pad2(lastDay)}`
  };
}

function formatIsraeliDate(dateStr: string): string {
  const parts = dateStr.split("-");
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

function buildShiftsByDate(shifts: ParentCalendarShift[]): Map<string, ParentCalendarShift[]> {
  const map = new Map<string, ParentCalendarShift[]>();
  for (const shift of shifts) {
    const list = map.get(shift.bookingDate) ?? [];
    list.push(shift);
    map.set(shift.bookingDate, list);
  }
  return map;
}

function filterShiftsByView(shifts: ParentCalendarShift[], view: CalendarViewMode): ParentCalendarShift[] {
  const today = todayDateISO();
  switch (view) {
    case "today":
      return shifts.filter((s) => s.bookingDate === today);
    case "week": {
      const { start, end } = getWeekRange();
      return shifts.filter((s) => s.bookingDate >= start && s.bookingDate <= end);
    }
    case "month": {
      const { start, end } = getMonthRange();
      return shifts.filter((s) => s.bookingDate >= start && s.bookingDate <= end);
    }
    case "all":
      return shifts;
    default:
      return shifts;
  }
}

function parentBookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "ממתין לאישור";
    case "approved":
      return "מאושר";
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

function ShiftCard({ shift, compact = false }: { shift: ParentCalendarShift; compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-slate-100 p-3 text-right shadow-sm ${shiftAccentClass(shift.status)} border-r-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold whitespace-nowrap ${statusBadgeClass(shift.status)}`}
        >
          {parentBookingStatusLabel(shift.status)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-bold text-[#001F3F] ${compact ? "text-xs" : "text-sm"}`}>
            {shift.sitterName}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-600 tabular-nums">{shift.scheduleLabel}</p>
        </div>
      </div>
      {!compact ? (
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
          <Link
            href={`/parent/sitter/${encodeURIComponent(shift.sitterId)}`}
            className="font-bold text-navy-header underline"
          >
            פרופיל שמרטפית
          </Link>
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
  subtitle,
  children,
  className = ""
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm ${className}`.trim()}
    >
      <div className="shrink-0 border-b border-slate-100 px-4 py-3 text-right">
        <p className="text-sm font-bold text-navy-header">{title}</p>
        {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function TodayGridView({ shifts }: { shifts: ParentCalendarShift[] }) {
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
                  <p className="truncate text-[10px] font-bold text-[#001F3F]">{shift.sitterName}</p>
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

function WeekGridView({ shifts }: { shifts: ParentCalendarShift[] }) {
  const { start } = getWeekRange();
  const startDate = new Date(`${start}T12:00:00`);
  const [selectedIso, setSelectedIso] = useState(todayDateISO());
  const shiftsByDate = useMemo(() => buildShiftsByDate(shifts), [shifts]);

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
          weekday: HEBREW_WEEKDAYS[d.getDay()]!,
          weekdayFull: HEBREW_WEEKDAY_FULL[d.getDay()]!,
          hasShifts: dayShifts.length > 0,
          shifts: dayShifts,
          isToday: iso === todayDateISO()
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
              <ShiftCard key={shift.id} shift={shift} compact />
            ))}
          </div>
        )}
      </div>
    </CalendarShell>
  );
}

function MonthGridView({ shifts }: { shifts: ParentCalendarShift[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDay.getDay();
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const shiftsByDate = useMemo(() => buildShiftsByDate(shifts), [shifts]);
  const monthHasShifts = shifts.length > 0;

  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, iso: null });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      iso: `${year}-${pad2(month)}-${pad2(day)}`
    });
  }

  const selectedShifts = selectedIso ? (shiftsByDate.get(selectedIso) ?? []) : [];

  return (
    <CalendarShell
      className="h-full"
      title={now.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}
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
                  <ShiftCard key={shift.id} shift={shift} compact />
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

function OverviewGridView({ shifts }: { shifts: ParentCalendarShift[] }) {
  const shiftsByDate = useMemo(() => buildShiftsByDate(shifts), [shifts]);
  const grouped = useMemo(
    () => [...shiftsByDate.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [shiftsByDate]
  );
  const hasShifts = shifts.length > 0;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDay.getDay();

  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, iso: null });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: `${year}-${pad2(month)}-${pad2(day)}` });
  }

  return (
    <CalendarShell
      className="h-full"
      title="סקירת כל המשמרות"
      subtitle={hasShifts ? `${shifts.length} משמרות שנקבעו` : embeddedEmptyHint("all")}
    >
      <div className="shrink-0 grid grid-cols-7 gap-1 border-b border-slate-100 px-2 py-2 text-center text-[10px] font-bold text-slate-400">
        {HEBREW_WEEKDAYS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="shrink-0 grid grid-cols-7 gap-1 p-2">
        {cells.map((cell, index) => {
          if (!cell.day || !cell.iso) {
            return <div key={`empty-${index}`} className="min-h-[2.75rem]" />;
          }
          const dayShifts = shiftsByDate.get(cell.iso) ?? [];
          const hasDayShifts = dayShifts.length > 0;
          return (
            <div
              key={cell.iso}
              className="flex min-h-[2.75rem] flex-col items-center justify-center rounded-lg border border-slate-100 bg-white p-0.5"
            >
              <span className={`text-xs tabular-nums ${dateLabelClass(hasDayShifts)}`}>{cell.day}</span>
            </div>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain border-t border-slate-100">
        {!hasShifts ? (
          <p className={`px-4 py-6 text-center text-xs ${DATE_WITHOUT_SHIFT_CLASS}`}>
            {embeddedEmptyHint("all")}
          </p>
        ) : (
          grouped.map(([date, dateShifts]) => (
            <div key={date} className="px-3 py-3">
              <p className={`mb-2 text-right text-xs tabular-nums ${dateLabelClass(true)}`}>
                {formatIsraeliDate(date)}
              </p>
              <div className="space-y-2">
                {dateShifts.map((shift) => (
                  <ShiftCard key={shift.id} shift={shift} compact />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </CalendarShell>
  );
}

export default function ParentCalendarPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [allShifts, setAllShifts] = useState<ParentCalendarShift[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("today");

  const fetchBookedShifts = useCallback(async (resolvedParentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoadingBookings(true);
    try {
      const { data: rows, error } = await supabase
        .from(BOOKINGS_TABLE)
        .select("id, parent_id, sitter_id, booking_date, start_time, end_time, status")
        .eq("parent_id", resolvedParentId)
        .in("status", BOOKED_STATUSES)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        console.warn("[parent/calendar] bookings load:", error.message);
        setAllShifts([]);
        return;
      }

      const bookings = rows ?? [];
      if (bookings.length === 0) {
        setAllShifts([]);
        return;
      }

      const sitterIds = [...new Set(bookings.map((b) => String((b as { sitter_id: string }).sitter_id)))];
      const { data: profiles } = await supabase
        .from(PROFILES_TABLE)
        .select("id, full_name")
        .in("id", sitterIds);

      const nameBySitterId = new Map<string, string>();
      for (const profile of profiles ?? []) {
        if (!profile || typeof profile !== "object" || !("id" in profile)) continue;
        const id = String((profile as { id: string }).id);
        const name = String((profile as { full_name?: string | null }).full_name ?? "").trim();
        if (name) nameBySitterId.set(id, name);
      }

      const formatted: ParentCalendarShift[] = bookings.map((raw) => {
        const row = raw as {
          id: string;
          sitter_id: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          status: BookingStatus;
        };
        return {
          id: row.id,
          sitterId: row.sitter_id,
          sitterName: nameBySitterId.get(row.sitter_id) ?? "שמרטפית AnyNanny",
          bookingDate: row.booking_date,
          startTime: row.start_time,
          endTime: row.end_time,
          status: row.status,
          scheduleLabel: formatBookingSchedule(row)
        };
      });

      setAllShifts(formatted);
    } catch (e) {
      console.warn("[parent/calendar] bookings fetch failed:", e);
      setAllShifts([]);
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          if (!cancelled) router.replace("/auth/login?next=/parent/calendar");
          return;
        }

        const { data: profile, error } = await supabase
          .from(PROFILES_TABLE)
          .select("id, role, full_name")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("[parent/calendar] profile load:", error.message);
        }

        if (!cancelled && profile?.role && profile.role !== "parent") {
          router.replace("/parent/dashboard");
          return;
        }

        if (!cancelled) {
          setParentId(user.id);
          setReady(true);
        }
      } catch (e) {
        console.warn("[parent/calendar] bootstrap failed:", e);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!parentId) return;
    void fetchBookedShifts(parentId);
  }, [parentId, fetchBookedShifts]);

  const filteredShifts = useMemo(
    () => filterShiftsByView(allShifts, viewMode),
    [allShifts, viewMode]
  );

  if (!ready) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <p className="text-center text-sm text-slate-600">טוען...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden" dir="rtl">
      <div className="shrink-0 space-y-4 pb-3">
        <Link
          href="/parent/dashboard"
          className="flex items-center gap-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          <span>חזרה לדשבורד</span>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>

        <div>
          <label htmlFor="calendar-view-mode" className="mb-2 block pr-1 text-xs font-bold text-slate-400">
            בחר תצוגה
          </label>
          <div className="relative">
            <select
              id="calendar-view-mode"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as CalendarViewMode)}
              className="w-full cursor-pointer appearance-none rounded-2xl border border-navy-header/10 bg-white p-3.5 text-right text-sm font-semibold text-navy-header shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-navy-header/20"
            >
              {VIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
              <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {viewMode === "today" ? (
          <TodayGridView shifts={filteredShifts} />
        ) : viewMode === "week" ? (
          <WeekGridView shifts={filteredShifts} />
        ) : viewMode === "month" ? (
          <MonthGridView shifts={filteredShifts} />
        ) : (
          <OverviewGridView shifts={filteredShifts} />
        )}
        {loadingBookings ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-label="טוען משמרות" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
