import type { ReactNode } from "react";
import {
  formatBookingScheduleParts,
  splitScheduleTimeRange,
  type PendingBookingView
} from "@/lib/bookings/sitter-pending-bookings";

const TIME_RANGE_CLASS = "inline-block tabular-nums whitespace-nowrap";

/**
 * Isolates a booking clock range as LTR so start stays on the left and end on the right
 * inside RTL Hebrew copy. Does not change stored start/end values.
 */
export function BookingTimeRange({
  start,
  end,
  children,
  className
}: {
  start?: string;
  end?: string;
  children?: ReactNode;
  className?: string;
}) {
  const content = children ?? (start && end ? `${start}–${end}` : start || end || null);
  if (!content) return null;
  return (
    <span dir="ltr" className={className ?? TIME_RANGE_CLASS}>
      {content}
    </span>
  );
}

/** Renders a preformatted `formatBookingSchedule` / cancellation-when string with an LTR time isolate. */
export function BookingScheduleText({
  label,
  className
}: {
  label: string;
  className?: string;
}) {
  const split = splitScheduleTimeRange(label);
  if (!split) {
    return <span className={className}>{label}</span>;
  }
  return (
    <span className={className}>
      {split.prefix}
      <BookingTimeRange>{split.timeRange}</BookingTimeRange>
    </span>
  );
}

export function BookingScheduleLabel({
  booking,
  className
}: {
  booking: Pick<PendingBookingView, "booking_date" | "start_time" | "end_time">;
  className?: string;
}) {
  const { dayLabel, startLabel, endLabel } = formatBookingScheduleParts(booking);
  return (
    <span className={className}>
      {dayLabel}
      {" · "}
      <BookingTimeRange start={startLabel} end={endLabel} />
    </span>
  );
}
