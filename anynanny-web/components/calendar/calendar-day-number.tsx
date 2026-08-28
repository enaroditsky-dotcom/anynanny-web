import type { ReactNode } from "react";
import {
  calendarDateButtonAria,
  isCalendarDateSelected,
  isCalendarToday,
  type CalendarDateStatusFill
} from "@/lib/bookings/calendar-date-cell";
import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { calendarDayNumberClass } from "@/components/calendar/calendar-date-cell";

export function CalendarDayNumber({
  children,
  iso,
  selectedIso,
  statusFill = "none",
  todayIso,
  className = ""
}: {
  children: ReactNode;
  iso: string;
  selectedIso: string | null | undefined;
  statusFill?: CalendarDateStatusFill;
  todayIso?: string;
  className?: string;
}) {
  const resolvedToday = todayIso ?? todayDateISO();
  const isToday = isCalendarToday(iso, resolvedToday);
  const isSelected = isCalendarDateSelected(iso, selectedIso);

  return (
    <span
      className={`${calendarDayNumberClass({
        isToday,
        isSelected,
        statusFill
      })} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

export { calendarDateButtonAria };
