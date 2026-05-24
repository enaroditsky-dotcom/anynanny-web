"use client";

import {
  DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL,
  DoubleShakeCircleButton,
  DoubleShakeDisabledCircleState,
  DoubleShakeParentActivationCircle,
  isDoubleShakeShiftTimeWindowActive
} from "@/components/session/double-shake-circle-button";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import {
  formatParentShiftApproveButtonLabel,
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";
import {
  normalizeBookingStatus,
  useShiftActivationStatus,
  type BookingStatusInput
} from "@/lib/bookings/use-shift-activation-status";
import {
  SHIFT_COMPLETED_CIRCLE_LABEL,
  shouldHardLockShiftBooking
} from "@/lib/session/dismissed-shift-lock";

type Props = {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  busy?: boolean;
  sessionActive?: boolean;
  onStartShift: () => void;
};

function isHardTerminalStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized === "rejected" || normalized === "cancelled";
}

function ActivationCircleSlot({
  liveKey,
  justActivated,
  onStartShift,
  isUpcoming,
  active,
  busy,
  bookingId
}: {
  liveKey: string;
  justActivated: boolean;
  onStartShift: () => void;
  isUpcoming: boolean;
  active: boolean;
  busy?: boolean;
  bookingId?: string;
}) {
  return (
    <div key={liveKey} className="flex w-full flex-col items-center">
      <DoubleShakeParentActivationCircle
        justActivated={justActivated}
        onStartShift={onStartShift}
        isUpcoming={isUpcoming}
        active={active}
        busy={busy}
        bookingId={bookingId}
      />
    </div>
  );
}

function ParentDoubleShakeIdleCircleInner({
  booking,
  ready,
  busy,
  sessionActive = false,
  onStartShift
}: Props) {
  const { active, isUpcoming, justActivated, withinShiftHours } = useShiftActivationStatus(booking);
  const shiftAwake = isDoubleShakeShiftTimeWindowActive(active, isUpcoming);
  const status = normalizeBookingStatus(booking?.status as BookingStatusInput);

  const handleConfirmStart = () => {
    if (busy || sessionActive) return;
    onStartShift();
  };

  if (sessionActive) {
    return <DoubleShakeCircleButton label="משמרת פעילה" variant="navy" presentational />;
  }

  if (!booking) {
    return (
      <DoubleShakeDisabledCircleState
        label={ready ? DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL : "טוען נתוני משמרת..."}
        variant={ready ? "disabled" : "loading"}
      />
    );
  }

  const liveKey = bookingLiveSyncKey(booking);

  if (!ready) {
    return <DoubleShakeDisabledCircleState label="טוען נתוני משמרת..." variant="loading" />;
  }

  if (isHardTerminalStatus(booking.status)) {
    return <DoubleShakeDisabledCircleState label={DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL} variant="disabled" />;
  }

  if (shiftAwake || withinShiftHours) {
    if (status === "sitter_started") {
      return (
        <DoubleShakeCircleButton
          label={formatParentShiftApproveButtonLabel(
            booking.partner_full_name,
            booking.partner_sitter_code
          )}
          variant="approve"
          busy={busy}
          onClick={handleConfirmStart}
        />
      );
    }

    if (status === "parent_started") {
      return <DoubleShakeCircleButton label="משמרת פעילה" variant="navy" presentational />;
    }

    if (status === "sitter_ended") {
      return (
        <DoubleShakeCircleButton
          label="הבייביסיטר ביקש לסיים - אשר סיום"
          variant="salmon"
          presentational
        />
      );
    }

    return (
      <ActivationCircleSlot
        liveKey={liveKey}
        justActivated={justActivated}
        onStartShift={handleConfirmStart}
        isUpcoming={isUpcoming}
        active={active}
        busy={busy}
        bookingId={booking.id}
      />
    );
  }

  return <DoubleShakeDisabledCircleState label={DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL} variant="disabled" />;
}

export function ParentDoubleShakeIdleCircle(props: Props) {
  if (shouldHardLockShiftBooking(props.booking)) {
    return (
      <DoubleShakeDisabledCircleState label={SHIFT_COMPLETED_CIRCLE_LABEL} variant="disabled" />
    );
  }

  return <ParentDoubleShakeIdleCircleInner {...props} />;
}
