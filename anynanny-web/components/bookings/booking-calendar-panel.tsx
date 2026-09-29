"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AllShiftsListView,
  CALENDAR_VIEW_OPTIONS,
  CalendarPeriodControls,
  filterCalendarShiftsByView,
  MonthGridView,
  TodayGridView,
  WeekGridView,
  type CalendarShift,
  type CalendarShiftActionContext,
  type CalendarViewMode
} from "@/components/bookings/booking-calendar-views";
import { calendarStateForFocusBooking } from "@/lib/bookings/focus-calendar-booking";

type BookingCalendarPanelProps = CalendarShiftActionContext & {
  shifts: CalendarShift[];
  loading?: boolean;
  viewModeSelectId?: string;
  className?: string;
  viewOptions?: { value: CalendarViewMode; label: string }[];
  focusBookingId?: string | null;
  /** Sitter shift board: pin controls and scroll only the schedule frame. */
  layout?: "default" | "board";
  /** When false, the schedule frame grows and the page scroller is used. */
  containScroll?: boolean;
};

export function BookingCalendarPanel({
  shifts,
  loading = false,
  viewModeSelectId = "calendar-view-mode",
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
  className = "",
  viewOptions = CALENDAR_VIEW_OPTIONS,
  focusBookingId = null,
  layout = "default",
  containScroll = true
}: BookingCalendarPanelProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("today");
  const initialPeriod = new Date();
  const [currentMonth, setCurrentMonth] = useState(initialPeriod.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(initialPeriod.getFullYear());
  const appliedFocusRef = useRef<string | null>(null);

  const allowedViews = useMemo(
    () => viewOptions.map((option) => option.value),
    [viewOptions]
  );

  const focusState = useMemo(
    () =>
      calendarStateForFocusBooking(shifts, focusBookingId, {
        viewOptions: allowedViews
      }),
    [shifts, focusBookingId, allowedViews]
  );

  useEffect(() => {
    if (!focusBookingId) {
      appliedFocusRef.current = null;
      return;
    }
    if (!focusState) return;
    if (appliedFocusRef.current === focusBookingId) return;
    appliedFocusRef.current = focusBookingId;
    setViewMode(focusState.viewMode);
    setCurrentMonth(focusState.month);
    setCurrentYear(focusState.year);
  }, [focusBookingId, focusState]);

  const filteredShifts = useMemo(
    () =>
      filterCalendarShiftsByView(
        shifts,
        viewMode,
        { month: currentMonth, year: currentYear },
        Date.now(),
        viewerUserId
      ),
    [shifts, viewMode, currentMonth, currentYear, viewerUserId]
  );

  const viewProps = {
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
    highlightedBookingId: focusState?.highlightedBookingId ?? null
  };

  const viewSelect = (compact: boolean) => (
    <div className="relative">
      <select
        id={viewModeSelectId}
        aria-label={compact ? "תצוגה" : undefined}
        value={viewMode}
        onChange={(e) => setViewMode(e.target.value as CalendarViewMode)}
        className={
          compact
            ? "min-h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm font-semibold text-navy-header shadow-sm"
            : "min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-3 text-base font-medium text-navy-header"
        }
      >
        {viewOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
        <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden>
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  );

  const schedule = (board: boolean) =>
    viewMode === "today" ? (
      <TodayGridView
        shifts={filteredShifts}
        presentation={board ? "shifts" : "timeline"}
        {...viewProps}
      />
    ) : viewMode === "week" ? (
      <WeekGridView shifts={filteredShifts} flush={board} stickyDayStrip={board} {...viewProps} />
    ) : viewMode === "month" ? (
      <MonthGridView
        shifts={filteredShifts}
        currentMonth={currentMonth}
        currentYear={currentYear}
        onMonthChange={setCurrentMonth}
        onYearChange={setCurrentYear}
        focusDateIso={focusState?.dateIso ?? null}
        flush={board}
        hidePeriodControls={board}
        {...viewProps}
      />
    ) : viewMode === "pending_sitter_approval" ? (
      <AllShiftsListView
        shifts={filteredShifts}
        title="משמרות שממתינות לאישור בייביסיטר"
        emptyView="pending_sitter_approval"
        sortDirection="asc"
        flush={board}
        {...viewProps}
      />
    ) : (
      <AllShiftsListView shifts={filteredShifts} flush={board} {...viewProps} />
    );

  const loadingOverlay = loading ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="טוען משמרות" />
    </div>
  ) : null;

  if (layout === "board") {
    return (
      <div
        className={`flex w-full min-w-0 flex-col ${containScroll ? "h-full min-h-0" : ""} ${className}`.trim()}
        dir="rtl"
      >
        <div className="mb-2 shrink-0">
          {viewSelect(true)}
        </div>
        {viewMode === "month" ? (
          <div className="mb-2 shrink-0 rounded-xl border border-slate-200/80 bg-white px-2 py-2 shadow-sm">
            <CalendarPeriodControls
              compact
              currentMonth={currentMonth}
              currentYear={currentYear}
              onMonthChange={setCurrentMonth}
              onYearChange={setCurrentYear}
            />
          </div>
        ) : null}
        <div
          data-shift-board-scroll=""
          className={
            containScroll
              ? "relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain touch-pan-y rounded-2xl border border-slate-200/80 bg-white shadow-soft"
              : "relative min-w-0 overflow-x-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft"
          }
        >
          {schedule(true)}
          {loadingOverlay}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full min-w-0 flex-col ${className}`.trim()} dir="rtl">
      <div className="w-full min-w-0 shrink-0 space-y-2 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft">
        <label htmlFor={viewModeSelectId} className="block text-sm font-normal text-slate-600">
          בחר תצוגה
        </label>
        {viewSelect(false)}
      </div>

      <div className="relative mt-4 min-w-0">
        {schedule(false)}
        {loadingOverlay}
      </div>
    </div>
  );
}
