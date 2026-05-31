"use client";

import {
  DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL,
  DoubleShakeCircleButton,
  DoubleShakeDisabledCircleState,
  DoubleShakeParentActivationCircle,
  isDoubleShakeShiftTimeWindowActive,
  type DoubleShakeCircleVariant
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
import {
  SESSION_ACTION_CIRCLE_STYLE,
  SESSION_CIRCLE_INNER_CLASS,
  SESSION_CIRCLE_SHELL_CLASS,
  SESSION_CIRCLE_SIZE_CLASS
} from "@/lib/session/session-circle";

type Props = {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  busy?: boolean;
  sessionActive?: boolean;
  onStartShift: () => void;
};

/** Live timer + accrued amount — fixed square, SVG track inset so stroke never clips. */
export function ParentSessionTimerCircle({
  timerText,
  amountLabel,
  variant = "salmon"
}: {
  timerText: string;
  amountLabel: string;
  variant?: Extract<DoubleShakeCircleVariant, "salmon" | "navy">;
}) {
  const shellVariant =
    variant === "navy"
      ? "bg-[#001F3F] text-white shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/25"
      : "bg-[#FF8A8A] text-white shadow-[0_10px_36px_-8px_rgba(255,138,138,0.75)] ring-[#FF8A8A]/40";

  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 pt-2 mt-2">
      <div className="mt-2 flex flex-col items-center justify-center pt-2">
        <div
          style={SESSION_ACTION_CIRCLE_STYLE}
          className={`${SESSION_CIRCLE_SIZE_CLASS} ${SESSION_CIRCLE_SHELL_CLASS} ${shellVariant}`}
          role="status"
          aria-live="polite"
          aria-label={`משמרת פעילה — ${timerText}, ${amountLabel}`}
        >
          <svg
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-white/30"
            />
          </svg>
          <div className={SESSION_CIRCLE_INNER_CLASS}>
            <span className="max-w-[8.5rem] text-sm font-bold tabular-nums leading-none">
              {timerText}
            </span>
            <span className="max-w-[8.5rem] text-xs font-semibold tabular-nums leading-none text-white/95">
              {amountLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div key={liveKey} className="flex w-full flex-col items-center justify-center py-1">
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

  if (status === "pending") {
    return (
      <DoubleShakeCircleButton
        label="בקשה נשלחה — ממתינים לאישור"
        variant="waiting-navy"
        presentational
      />
    );
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

  if (status === "approved") {
    return (
      <DoubleShakeCircleButton
        label="המשמרת אושרה — ממתין לשעת ההתחלה"
        variant="waiting-navy"
        presentational
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
