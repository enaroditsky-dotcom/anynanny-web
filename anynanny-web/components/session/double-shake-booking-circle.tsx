"use client";

import { ParentDoubleShakeIdleCircle } from "@/components/session/parent-double-shake-idle-circle";
import { SitterDoubleShakeIdleCircle } from "@/components/session/sitter-double-shake-idle-circle";
import { DoubleShakeCircleSlot, DoubleShakeShiftPanel } from "@/components/session/double-shake-circle-button";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";

type BaseProps = {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  className?: string;
};

type ParentProps = BaseProps & {
  role: "parent";
  onStartShift: () => void;
};

type SitterProps = BaseProps & {
  role: "sitter";
  onBookingUpdated: () => Promise<TodaysLinkedBookingView | null>;
  onError?: (message: string) => void;
  onForceEndSuccess?: () => void;
  onEndShift?: () => Promise<void>;
};

export type DoubleShakeBookingCircleProps = ParentProps | SitterProps;

/** Standalone Double-Shake circle block (parent or sitter) — same layout on every screen. */
export function DoubleShakeBookingCircle(props: DoubleShakeBookingCircleProps) {
  const { booking, ready, className = "" } = props;

  return (
    <DoubleShakeShiftPanel className={className}>
      <DoubleShakeCircleSlot>
        {props.role === "parent" ? (
          <ParentDoubleShakeIdleCircle
            key={bookingLiveSyncKey(booking)}
            booking={booking}
            ready={ready}
            onStartShift={props.onStartShift}
          />
        ) : (
          <SitterDoubleShakeIdleCircle
            key={bookingLiveSyncKey(booking)}
            booking={booking}
            ready={ready}
            onBookingUpdated={props.onBookingUpdated}
            onError={props.onError}
            onForceEndSuccess={props.onForceEndSuccess}
            onEndShift={props.onEndShift}
          />
        )}
      </DoubleShakeCircleSlot>
    </DoubleShakeShiftPanel>
  );
}
