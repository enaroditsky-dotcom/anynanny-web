"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AllShiftsListView,
  CALENDAR_VIEW_OPTIONS,
  filterCalendarShiftsByView,
  MonthGridView,
  TodayGridView,
  WeekGridView,
  type CalendarShift,
  type CalendarShiftActionContext,
  type CalendarViewMode
} from "@/components/bookings/booking-calendar-views";

type BookingCalendarPanelProps = CalendarShiftActionContext & {
  shifts: CalendarShift[];
  loading?: boolean;
  viewModeSelectId?: string;
  className?: string;
  viewOptions?: { value: CalendarViewMode; label: string }[];
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
  viewOptions = CALENDAR_VIEW_OPTIONS
}: BookingCalendarPanelProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("today");
  const initialPeriod = new Date();
  const [currentMonth, setCurrentMonth] = useState(initialPeriod.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(initialPeriod.getFullYear());

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
    onWithdrawPendingError
  };

  return (
    <div className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden ${className}`.trim()} dir="rtl">
      <div className="w-full min-w-0 shrink-0 space-y-2 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft">
        <label htmlFor={viewModeSelectId} className="block text-sm font-normal text-slate-600">
          בחר תצוגה
        </label>
        <div className="relative">
          <select
            id={viewModeSelectId}
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as CalendarViewMode)}
            className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-3 text-base font-medium text-navy-header"
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
      </div>

      <div className="relative mt-4 min-h-0 min-w-0 flex-1 overflow-hidden">
        {viewMode === "today" ? (
          <TodayGridView shifts={filteredShifts} {...viewProps} />
        ) : viewMode === "week" ? (
          <WeekGridView shifts={filteredShifts} {...viewProps} />
        ) : viewMode === "month" ? (
          <MonthGridView
            shifts={filteredShifts}
            currentMonth={currentMonth}
            currentYear={currentYear}
            onMonthChange={setCurrentMonth}
            onYearChange={setCurrentYear}
            {...viewProps}
          />
        ) : viewMode === "pending_sitter_approval" ? (
          <AllShiftsListView
            shifts={filteredShifts}
            title="משמרות שממתינות לאישור בייביסיטר"
            emptyView="pending_sitter_approval"
            sortDirection="asc"
            {...viewProps}
          />
        ) : (
          <AllShiftsListView shifts={filteredShifts} {...viewProps} />
        )}
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="טוען משמרות" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
