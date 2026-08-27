"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock, FileSearch, MapPin } from "lucide-react";
import type { BookingPaymentStatus, BookingStatus } from "@/lib/bookings/constants";
import {
  bookingPaymentStatusLabel,
  resolveBookingPaymentDisplayKind
} from "@/lib/bookings/payment-status-label";
import { resolveBookingWindowMs, todayDateISO } from "@/lib/bookings/booking-date-utils";
import type { BookingCancellationFields, CancellationRequesterRole } from "@/lib/bookings/cancellation-request";
import {
  calendarViewEmptyHint,
  CALENDAR_VIEW_OPTIONS,
  filterCalendarShiftsByView,
  isUpcomingOrActiveCalendarShift,
  PARENT_CALENDAR_VIEW_OPTIONS,
  type CalendarViewMode
} from "@/lib/bookings/calendar-shift-filters";
import {
  calendarBookingDomId,
  dateIsoInCalendarMonth
} from "@/lib/bookings/focus-calendar-booking";
import { PendingWithdrawButton } from "@/components/bookings/pending-withdraw-button";
import { ScheduledShiftActions } from "@/components/bookings/scheduled-shift-actions";
import { CancelledShiftAckBanner } from "@/components/bookings/cancelled-shift-ack-banner";
import {
  CANCELLATION_COPY,
  isTemporarilyVisibleCancelledShift
} from "@/lib/bookings/cancellation-request";

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
  paymentStatus?: BookingPaymentStatus | null;
  paidAt?: string | null;
} & Partial<BookingCancellationFields>;

export type { CalendarViewMode };
export {
  CALENDAR_VIEW_OPTIONS,
  filterCalendarShiftsByView,
  isUpcomingOrActiveCalendarShift,
  PARENT_CALENDAR_VIEW_OPTIONS
};

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
  "min-h-11 min-w-0 flex-1 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-right text-sm font-medium text-navy-header";

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
  return calendarViewEmptyHint(view);
}

function shiftDateKey(shift: CalendarShift): string {
  return shift.bookingDate.slice(0, 10);
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

function completedCalendarPaymentClass(shift: CalendarShift): string {
  const kind = resolveBookingPaymentDisplayKind({
    paymentStatus: shift.paymentStatus,
    paidAt: shift.paidAt
  });
  if (kind === "paid") return "bg-emerald-50 text-emerald-800 border-emerald-100";
  if (kind === "pending_checkout") return "bg-rose-50 text-rose-800 border-rose-100";
  return "bg-amber-50 text-amber-800 border-amber-100";
}

function CalendarShiftStatusBadge({ shift }: { shift: CalendarShift }) {
  if (shift.status === "completed") {
    return (
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-center text-xs font-semibold ${completedCalendarPaymentClass(shift)}`}
      >
        <span className="block leading-tight whitespace-nowrap">הושלם</span>
        <span className="mt-0.5 block text-[11px] font-semibold leading-tight whitespace-nowrap">
          {bookingPaymentStatusLabel({
            paymentStatus: shift.paymentStatus,
            paidAt: shift.paidAt
          })}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusBadgeClass(shift.status)}`}
    >
      {bookingStatusLabel(shift.status)}
    </span>
  );
}

function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "ממתינה לאישור הבייביסיטר";
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
    case "cancelled":
      return CANCELLATION_COPY.approvedTitle;
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
    case "cancelled":
      return "bg-rose-50 text-rose-800 border-rose-100";
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
    case "cancelled":
      return "border-r-rose-400 bg-rose-50/80";
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

export type CalendarShiftActionContext = {
  profileHref?: (shift: CalendarShift) => string | null;
  profileLinkLabel?: string;
  contactHref?: (shift: CalendarShift) => string | null;
  renderProfileAction?: (shift: CalendarShift) => ReactNode;
  viewerRole?: CancellationRequesterRole;
  viewerUserId?: string | null;
  onRequestCancellation?: (shift: CalendarShift) => void;
  onApproveCancellation?: (shift: CalendarShift) => void;
  onAcknowledgeCancellation?: (shift: CalendarShift) => void;
  onWithdrawPending?: (shift: CalendarShift) => void;
  onWithdrawPendingError?: (message: string) => void;
  highlightedBookingId?: string | null;
};

type CalendarViewsContext = CalendarShiftActionContext;

function useScrollToHighlightedBooking(shiftId: string, highlightedBookingId?: string | null) {
  useEffect(() => {
    if (!highlightedBookingId || highlightedBookingId !== shiftId) return;
    const el = document.getElementById(calendarBookingDomId(shiftId));
    if (!el) return;
    try {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch {
      /* ignore environments without layout/scroll */
    }
  }, [shiftId, highlightedBookingId]);
}

function bookingHighlightClass(highlighted: boolean): string {
  return highlighted ? " ring-2 ring-navy-header/40 ring-offset-2" : "";
}

function CalendarEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
        <FileSearch className="h-7 w-7" aria-hidden />
      </div>
      <p className="text-base font-semibold text-navy-header">{message}</p>
    </div>
  );
}

function toCancellationShift(shift: CalendarShift) {
  return {
    id: shift.id,
    status: shift.status,
    bookingDate: shift.bookingDate,
    startTime: shift.startTime,
    endTime: shift.endTime,
    partnerName: shift.partnerName,
    paymentStatus: shift.paymentStatus ?? null,
    cancellationRequestedBy: shift.cancellationRequestedBy ?? null,
    cancellationRequestedRole: shift.cancellationRequestedRole ?? null,
    cancellationRequestedAt: shift.cancellationRequestedAt ?? null,
    cancellationMessage: shift.cancellationMessage ?? null,
    cancellationApprovedBy: shift.cancellationApprovedBy ?? null,
    cancellationApprovedAt: shift.cancellationApprovedAt ?? null,
    cancelledBy: shift.cancelledBy ?? null,
    cancelledAt: shift.cancelledAt ?? null,
    cancellationAcknowledgedAt: shift.cancellationAcknowledgedAt ?? null
  };
}

function ShiftScheduledActions({
  shift,
  profileHref,
  profileLinkLabel,
  contactHref,
  renderProfileAction,
  viewerRole,
  viewerUserId,
  onRequestCancellation,
  onApproveCancellation,
  onAcknowledgeCancellation,
  onWithdrawPending,
  onWithdrawPendingError
}: CalendarViewsContext & { shift: CalendarShift }) {
  if (isTemporarilyVisibleCancelledShift(toCancellationShift(shift), viewerUserId)) {
    if (!onAcknowledgeCancellation) return null;
    return <CancelledShiftAckBanner onAcknowledge={() => onAcknowledgeCancellation(shift)} />;
  }

  if (shift.status === "pending" && viewerRole === "parent" && onWithdrawPending) {
    const href = profileHref?.(shift) ?? null;
    return (
      <div className="mt-3 flex flex-row-reverse flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        {href && profileLinkLabel ? (
          <Link href={href} className="text-xs font-semibold text-navy-header underline underline-offset-2">
            {profileLinkLabel}
          </Link>
        ) : null}
        <PendingWithdrawButton
          bookingId={shift.id}
          onSuccess={() => onWithdrawPending(shift)}
          onError={onWithdrawPendingError}
        />
      </div>
    );
  }

  if (!viewerRole || !viewerUserId || !onRequestCancellation || !onApproveCancellation) {
    const href = profileHref?.(shift) ?? null;
    if (!href || !profileLinkLabel) return null;
    return (
      <div className="mt-2 text-xs">
        <Link href={href} className="font-semibold text-navy-header underline">
          {profileLinkLabel}
        </Link>
      </div>
    );
  }

  if (shift.status !== "approved") {
    const href = profileHref?.(shift) ?? null;
    if (!href || !profileLinkLabel) return null;
    return (
      <div className="mt-2 text-xs">
        <Link href={href} className="font-semibold text-navy-header underline">
          {profileLinkLabel}
        </Link>
      </div>
    );
  }

  return (
    <ScheduledShiftActions
      shift={toCancellationShift(shift)}
      viewerRole={viewerRole}
      viewerUserId={viewerUserId}
      profileLabel={profileLinkLabel ?? ""}
      profileHref={profileHref?.(shift) ?? null}
      renderProfile={renderProfileAction?.(shift)}
      contactHref={contactHref?.(shift) ?? null}
      onRequestCancellation={() => onRequestCancellation(shift)}
      onApproveCancellation={() => onApproveCancellation(shift)}
    />
  );
}

function ShiftCard({
  shift,
  compact = false,
  profileHref,
  profileLinkLabel,
  contactHref,
  renderProfileAction,
  viewerRole,
  viewerUserId,
  onRequestCancellation,
  onApproveCancellation,
  onAcknowledgeCancellation,
  onWithdrawPending,
  onWithdrawPendingError,
  highlightedBookingId
}: CalendarViewsContext & {
  shift: CalendarShift;
  compact?: boolean;
}) {
  const highlighted = highlightedBookingId === shift.id;
  useScrollToHighlightedBooking(shift.id, highlightedBookingId);
  const actionProps = {
    profileHref,
    profileLinkLabel,
    contactHref,
    renderProfileAction,
    viewerRole,
    viewerUserId,
    onRequestCancellation,
    onApproveCancellation,
    onAcknowledgeCancellation,
    onWithdrawPending,
    onWithdrawPendingError
  };

  return (
    <div
      id={calendarBookingDomId(shift.id)}
      data-booking-id={shift.id}
      aria-current={highlighted ? "true" : undefined}
      className={`rounded-2xl border border-slate-200/80 p-3 text-right shadow-sm ${shiftAccentClass(shift.status)} border-r-4${bookingHighlightClass(highlighted)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <CalendarShiftStatusBadge shift={shift} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold text-navy-header ${compact ? "text-xs" : "text-sm"}`}>
            {shift.partnerName}
          </p>
          {shift.partnerAddress?.trim() ? (
            <p className="mt-0.5 inline-flex max-w-full flex-row-reverse items-start gap-1 text-sm font-normal leading-snug text-slate-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 text-right">{shift.partnerAddress.trim()}</span>
            </p>
          ) : null}
          <p className="mt-0.5 text-sm font-normal text-slate-600 tabular-nums">{shift.scheduleLabel}</p>
        </div>
      </div>
      {!compact ? (
        <div className="mt-2 flex items-center justify-end text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {formatClockTime(shift.startTime)} – {formatClockTime(shift.endTime)}
          </span>
        </div>
      ) : null}
      <ShiftScheduledActions shift={shift} {...actionProps} />
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
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft ${className}`.trim()}
    >
      <div className="shrink-0 border-b border-slate-100 px-4 py-3 text-right">
        {titleControl ?? (title ? <p className="text-base font-semibold text-navy-header">{title}</p> : null)}
        {subtitle ? <p className="mt-0.5 text-sm font-normal text-slate-500">{subtitle}</p> : null}
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
  ...actionContext
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
        <p className={`text-lg font-semibold tabular-nums ${dateLabelClass(hasShifts)}`}>{formatIsraeliDate(today)}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100">
        <div className="relative flex" style={{ minHeight: `${timelineHeightRem}rem` }}>
          <div className="sticky right-0 z-[1] w-12 shrink-0 border-l border-slate-100 bg-slate-50/95">
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex h-14 items-start justify-center pt-1 text-xs font-medium tabular-nums text-slate-600"
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
                  <p className="truncate text-xs font-semibold text-navy-header">{shift.partnerName}</p>
                  <p className="truncate text-xs font-normal text-slate-600 tabular-nums">
                    {formatClockTime(shift.startTime)} – {formatClockTime(shift.endTime)}
                  </p>
                </div>
              );
            })}
            {!hasShifts ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <CalendarEmptyState message={embeddedEmptyHint("today")} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {hasShifts ? (
        <div className="min-h-0 shrink-0 space-y-2 overflow-y-auto overscroll-contain border-t border-slate-100 px-3 py-3">
          {shifts.map((shift) => (
            <ShiftCard key={`card-${shift.id}`} shift={shift} {...actionContext} />
          ))}
        </div>
      ) : null}
    </CalendarShell>
  );
}

export function WeekGridView({
  shifts,
  ...actionContext
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
      <div className="shrink-0 grid grid-cols-7 gap-1 border-b border-slate-100 px-2 py-2 text-center text-xs font-semibold text-slate-500">
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
              <span className="mt-0.5 text-[10px] font-bold text-red-800">{day.shifts.length}</span>
            ) : (
              <span className="mt-0.5 text-[10px] text-blue-600">—</span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 px-3 py-3">
        <p className="mb-2 text-right text-sm">
          <span className={dateLabelClass(selectedShifts.length > 0)}>
            {selectedDay?.weekdayFull} · {formatIsraeliDate(selectedIso)}
          </span>
        </p>
        {selectedShifts.length === 0 ? (
          <CalendarEmptyState message="אין משמרות ביום זה" />
        ) : (
          <div className="space-y-2">
            {selectedShifts.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                compact
                {...actionContext}
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
  focusDateIso = null,
  ...actionContext
}: CalendarViewsContext & {
  shifts: CalendarShift[];
  currentMonth: number;
  currentYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  focusDateIso?: string | null;
}) {
  const firstDay = new Date(currentYear, currentMonth - 1, 1);
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const startOffset = firstDay.getDay();
  const [selectedIso, setSelectedIso] = useState<string | null>(() =>
    dateIsoInCalendarMonth(focusDateIso, currentMonth, currentYear)
  );

  const shiftsByDate = useMemo(() => buildCalendarShiftsByDate(shifts), [shifts]);
  const monthHasShifts = shifts.length > 0;

  useEffect(() => {
    const focused = dateIsoInCalendarMonth(focusDateIso, currentMonth, currentYear);
    setSelectedIso(focused);
  }, [currentMonth, currentYear, focusDateIso]);

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
      <div className="shrink-0 grid grid-cols-7 gap-1 border-b border-slate-100 px-2 py-2 text-center text-xs font-semibold text-slate-500">
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
                <p className="truncate text-[10px] font-bold text-red-800">{dayShifts.length} משמרות</p>
              ) : (
                <p className="text-[10px] text-blue-600">—</p>
              )}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 px-3 py-3">
        {selectedIso ? (
          <>
            <p className="mb-2 text-right text-sm">
              <span className={dateLabelClass(selectedShifts.length > 0)}>
                {formatIsraeliDate(selectedIso)}
              </span>
            </p>
            {selectedShifts.length === 0 ? (
              <CalendarEmptyState message="אין משמרות בתאריך זה" />
            ) : (
              <div className="space-y-2">
                {selectedShifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    compact
                    {...actionContext}
                  />
                ))}
              </div>
            )}
          </>
        ) : monthHasShifts ? (
          <p className="py-8 text-center text-sm font-normal text-slate-500">
            לחצו על תאריך לצפייה במשמרות
          </p>
        ) : (
          <CalendarEmptyState message={embeddedEmptyHint("month")} />
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
  highlightedBookingId,
  ...actionContext
}: CalendarViewsContext & { shift: CalendarShift }) {
  const labels = resolveShiftScheduleLabels(shift);
  const highlighted = highlightedBookingId === shift.id;
  useScrollToHighlightedBooking(shift.id, highlightedBookingId);

  return (
    <li
      id={calendarBookingDomId(shift.id)}
      data-booking-id={shift.id}
      aria-current={highlighted ? "true" : undefined}
      className={`rounded-2xl border border-slate-200/80 p-4 text-right shadow-sm ${shiftAccentClass(shift.status)} border-r-4${bookingHighlightClass(highlighted)}`}
    >
      <div className="flex flex-row-reverse items-start justify-between gap-2">
        <CalendarShiftStatusBadge shift={shift} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy-header">{shift.partnerName}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/90 p-3">
        <div className="flex flex-col gap-1 text-right">
          <p className="text-xs font-medium tracking-wide text-slate-500">תחילה</p>
          <span className="text-lg font-semibold tabular-nums text-navy-header">{labels.startTimeLabel}</span>
          <span className="text-sm font-normal tabular-nums text-slate-600">{labels.startDateLabel}</span>
        </div>

        <div className="flex flex-col gap-1 border-r border-slate-200 pr-3 text-right">
          <p className="text-xs font-medium tracking-wide text-slate-500">סיום</p>
          <span className="text-lg font-semibold tabular-nums text-navy-header">{labels.endTimeLabel}</span>
          <span className="text-sm font-normal tabular-nums text-slate-600">{labels.endDateLabel}</span>
        </div>
      </div>

      <ShiftScheduledActions shift={shift} {...actionContext} />
    </li>
  );
}

export function AllShiftsListView({
  shifts,
  title = "כל המשמרות שנקבעו",
  emptyView = "all",
  sortDirection = "desc",
  ...actionContext
}: CalendarViewsContext & {
  shifts: CalendarShift[];
  title?: string;
  emptyView?: CalendarViewMode;
  sortDirection?: "asc" | "desc";
}) {
  const hasShifts = shifts.length > 0;
  const emptyHint = embeddedEmptyHint(emptyView);
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
      const delta = (bWindow?.startMs ?? 0) - (aWindow?.startMs ?? 0);
      return sortDirection === "asc" ? -delta : delta;
    });
  }, [shifts, sortDirection]);

  return (
    <CalendarShell
      className="h-full"
      title={title}
      subtitle={hasShifts ? `${shifts.length} משמרות` : emptyHint}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {!hasShifts ? (
          <CalendarEmptyState message={emptyHint} />
        ) : (
          <ul className="space-y-3">
            {sortedShifts.map((shift) => (
              <AllShiftsListCard
                key={shift.id}
                shift={shift}
                {...actionContext}
              />
            ))}
          </ul>
        )}
      </div>
    </CalendarShell>
  );
}
