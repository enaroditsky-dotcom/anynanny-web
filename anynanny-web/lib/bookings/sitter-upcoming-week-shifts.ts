import { normalizeBookingStatus } from "@/lib/bookings/booking-status-normalize";
import { filterCalendarShiftsByView } from "@/lib/bookings/calendar-shift-filters";
import type { BookingStatus } from "@/lib/bookings/constants";

type WeekShiftInput = {
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
};

/**
 * Confirmed sitter shifts that the existing calendar "משמרות השבוע" filter would show.
 * Pending requests are excluded. No statuses are invented.
 */
export function countSitterShiftsInCurrentWeek(shifts: readonly WeekShiftInput[], nowMs = Date.now()): number {
  const relevant = shifts.flatMap((shift) => {
    const status = normalizeBookingStatus(shift.status as BookingStatus);
    if (!status) return [];
    return [
      {
        bookingDate: shift.booking_date,
        startTime: shift.start_time,
        endTime: shift.end_time,
        status
      }
    ];
  });
  return filterCalendarShiftsByView(relevant, "week", undefined, nowMs).length;
}
