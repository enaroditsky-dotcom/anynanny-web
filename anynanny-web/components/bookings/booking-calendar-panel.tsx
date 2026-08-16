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
  type CalendarViewMode
} from "@/components/bookings/booking-calendar-views";

type BookingCalendarPanelProps = {
  shifts: CalendarShift[];
  loading?: boolean;
  viewModeSelectId?: string;
  profileHref?: (shift: CalendarShift) => string | null;
  profileLinkLabel?: string;
  className?: string;
  viewOptions?: { value: CalendarViewMode; label: string }[];
};

export function BookingCalendarPanel({
  shifts,
  loading = false,
  viewModeSelectId = "calendar-view-mode",
  profileHref,
  profileLinkLabel,
  className = "",
  viewOptions = CALENDAR_VIEW_OPTIONS
}: BookingCalendarPanelProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("today");
  const initialPeriod = new Date();
  const [currentMonth, setCurrentMonth] = useState(initialPeriod.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(initialPeriod.getFullYear());

  const filteredShifts = useMemo(
    () => filterCalendarShiftsByView(shifts, viewMode, { month: currentMonth, year: currentYear }),
    [shifts, viewMode, currentMonth, currentYear]
  );

  const viewProps = { profileHref, profileLinkLabel };

  return (
    <div className={`flex h-full min-h-0 w-full flex-col overflow-hidden ${className}`.trim()} dir="rtl">
      <div className="shrink-0 pb-3">
        <label htmlFor={viewModeSelectId} className="mb-2 block pr-1 text-xs font-bold text-slate-400">
          בחר תצוגה
        </label>
        <div className="relative">
          <select
            id={viewModeSelectId}
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as CalendarViewMode)}
            className="w-full cursor-pointer appearance-none rounded-2xl border border-navy-header/10 bg-white p-3.5 text-right text-sm font-semibold text-navy-header shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-navy-header/20"
          >
            {viewOptions.map((option) => (
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
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
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-label="טוען משמרות" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
