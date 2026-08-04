"use client";

import { useCallback, useState } from "react";
import {
  DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL,
  DOUBLE_SHAKE_UPCOMING_SHIFT_LABEL,
  DoubleShakeCircleButton,
  DoubleShakeDisabledCircleState,
  isDoubleShakeShiftTimeWindowActive
} from "@/components/session/double-shake-circle-button";
import { ShiftActivationToast } from "@/components/session/shift-activation-toast";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import { sitterForceEndBooking } from "@/lib/bookings/sitter-force-end-booking";
import { sitterRequestEndBooking } from "@/lib/bookings/sitter-request-end-booking";
import { sitterStartShift } from "@/lib/bookings/sitter-start-shift";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import { isSitterBookingAwaitingApprovalStatus } from "@/lib/bookings/booking-realtime-handler";
import { useShiftActivationStatus } from "@/lib/bookings/use-shift-activation-status";
import {
  persistShiftLocallyDismissed,
  SHIFT_COMPLETED_CIRCLE_LABEL,
  shouldHardLockShiftBooking
} from "@/lib/session/dismissed-shift-lock";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

const SITTER_ARRIVAL_LABEL = "הגעתי! התחלת משמרת";
const SITTER_WAITING_PARENT_START_LABEL = "ממתין לאישור הורה...";
const SITTER_ACTIVE_SHIFT_LABEL = "משמרת פעילה";
const SITTER_WAITING_PARENT_END_LABEL = "ממתין לאישור סיום מההורה...";
const SITTER_WAKE_UP_TOAST = "המשמרת התחילה — אפשר ללחוץ הגעתי";

type Props = {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  onBookingUpdated: () => Promise<TodaysLinkedBookingView | null>;
  onError?: (message: string) => void;
  onForceEndSuccess?: () => void;
  onEndShift?: () => Promise<void>;
};

function isHardTerminalStatus(status: TodaysLinkedBookingView["status"] | undefined): boolean {
  return status === "rejected" || status === "cancelled";
}

function SitterActivationCircle({
  justActivated,
  busy,
  onArrival
}: {
  justActivated: boolean;
  busy: boolean;
  onArrival: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <ShiftActivationToast visible={justActivated} message={SITTER_WAKE_UP_TOAST} />
      <DoubleShakeCircleButton
        label={SITTER_ARRIVAL_LABEL}
        variant="emerald"
        busy={busy}
        onClick={onArrival}
      />
    </div>
  );
}

function SitterUpcomingCircle({ justActivated }: { justActivated: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <ShiftActivationToast visible={justActivated} message={SITTER_WAKE_UP_TOAST} />
      <DoubleShakeCircleButton
        label={DOUBLE_SHAKE_UPCOMING_SHIFT_LABEL}
        variant="emerald"
        presentational
      />
    </div>
  );
}

function SitterDoubleShakeIdleCircleInner({
  booking,
  ready,
  onBookingUpdated,
  onError,
  onForceEndSuccess,
  onEndShift
}: Props) {
  const { active, isUpcoming, justActivated, withinShiftHours } = useShiftActivationStatus(booking);
  const [busy, setBusy] = useState(false);
  const shiftAwake = isDoubleShakeShiftTimeWindowActive(active, isUpcoming);

  const handleArrival = useCallback(async () => {
    if (!booking || booking.status !== "approved") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      onError?.("Supabase לא זמין");
      return;
    }
    setBusy(true);
    const { error } = await sitterStartShift(supabase, booking.id);
    setBusy(false);
    if (error) {
      onError?.(error);
      return;
    }
    await onBookingUpdated();
  }, [booking, onBookingUpdated, onError]);

  const handleEndShift = useCallback(async () => {
    if (!booking || booking.status !== "parent_started") return;

    if (onEndShift) {
      setBusy(true);
      try {
        await onEndShift();
        await onBookingUpdated();
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "סיום משמרת נכשל.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      onError?.("יש להתחבר כדי לסיים משמרת.");
      return;
    }

    setBusy(true);
    const { row, error } = await sitterRequestEndBooking(auth.supabase, auth.userId, booking.id);
    setBusy(false);

    if (error || !row) {
      onError?.(error ?? "סיום משמרת נכשל.");
      return;
    }

    await onBookingUpdated();
  }, [booking, onBookingUpdated, onEndShift, onError]);

  const handleForceEnd = useCallback(async () => {
    if (!booking || booking.status !== "sitter_ended") return;

    persistShiftLocallyDismissed(booking.id);

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      onError?.("יש להתחבר כדי לסיים את המשמרת.");
      return;
    }

    setBusy(true);
    const { row, error } = await sitterForceEndBooking(auth.supabase, auth.userId, booking.id);
    setBusy(false);

    if (error || !row) {
      onError?.(error ?? "סיום כפוי נכשל.");
      return;
    }

    await onBookingUpdated();
    onForceEndSuccess?.();
  }, [booking, onBookingUpdated, onError, onForceEndSuccess]);

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

  if (isSitterBookingAwaitingApprovalStatus(booking.status)) {
    return (
      <DoubleShakeDisabledCircleState
        label="ממתין לאישור הבקשה — אשרו או דחו למעלה"
        variant="disabled"
      />
    );
  }

  if (shiftAwake || withinShiftHours) {
    if (booking.status === "sitter_started") {
      return (
        <DoubleShakeCircleButton
          label={SITTER_WAITING_PARENT_START_LABEL}
          variant="waiting-navy"
          presentational
        />
      );
    }

    if (booking.status === "parent_started") {
      return (
        <div className="flex w-full max-w-[17rem] flex-col items-center gap-3">
          <DoubleShakeCircleButton label={SITTER_ACTIVE_SHIFT_LABEL} variant="navy" presentational />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleEndShift()}
            className="w-full rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-900 transition hover:bg-rose-100 disabled:opacity-60"
          >
            {busy ? "מסיים משמרת..." : "סיום משמרת"}
          </button>
        </div>
      );
    }

    if (booking.status === "sitter_ended") {
      return (
        <div className="flex w-full max-w-[17rem] flex-col items-center gap-3">
          <DoubleShakeCircleButton
            label={SITTER_WAITING_PARENT_END_LABEL}
            variant="waiting-salmon"
            presentational
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleForceEnd()}
            className="w-full rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-900 transition hover:bg-rose-100 disabled:opacity-60"
          >
            {busy ? "מדווח למערכת..." : "סיום כפוי — הורה לא מגיב"}
          </button>
        </div>
      );
    }

    if (booking.status === "approved") {
      return (
        <div key={liveKey} className="flex w-full flex-col items-center">
          <SitterActivationCircle
            justActivated={justActivated}
            busy={busy}
            onArrival={() => void handleArrival()}
          />
        </div>
      );
    }

    return (
      <div key={liveKey} className="flex w-full flex-col items-center">
        <SitterUpcomingCircle justActivated={justActivated} />
      </div>
    );
  }

  if (booking.status === "approved") {
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

export function SitterDoubleShakeIdleCircle(props: Props) {
  if (shouldHardLockShiftBooking(props.booking)) {
    return (
      <DoubleShakeDisabledCircleState label={SHIFT_COMPLETED_CIRCLE_LABEL} variant="disabled" />
    );
  }

  return <SitterDoubleShakeIdleCircleInner {...props} />;
}