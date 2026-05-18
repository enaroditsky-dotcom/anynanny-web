"use client";

import {
  DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL,
  DoubleShakeCircleButton
} from "@/components/session/double-shake-circle-button";
import {
  formatParentShiftApproveButtonLabel,
  formatParentShiftStartButtonLabel,
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";

type Props = {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  onStartShift: () => void;
};

export function ParentDoubleShakeIdleCircle({ booking, ready, onStartShift }: Props) {
  if (!ready) {
    return <DoubleShakeCircleButton label="טוען…" variant="disabled" presentational />;
  }

  if (!booking) {
    return (
      <DoubleShakeCircleButton label={DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL} variant="disabled" presentational />
    );
  }

  if (booking.status === "sitter_started") {
    return (
      <DoubleShakeCircleButton
        label={formatParentShiftApproveButtonLabel(
          booking.partner_full_name,
          booking.partner_sitter_code
        )}
        variant="approve"
        onClick={onStartShift}
      />
    );
  }

  if (booking.status === "parent_started") {
    return (
      <DoubleShakeCircleButton label="משמרת פעילה" variant="navy" presentational />
    );
  }

  if (booking.status === "sitter_ended") {
    return (
      <DoubleShakeCircleButton
        label="הבייביסיטר ביקש לסיים — אשר סיום"
        variant="salmon"
        presentational
      />
    );
  }

  return (
    <DoubleShakeCircleButton
      label={formatParentShiftStartButtonLabel(booking.partner_full_name, booking.partner_sitter_code)}
      variant="navy"
      onClick={onStartShift}
    />
  );
}
