"use client";

import { useCallback, useState } from "react";
import {
  DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL,
  DoubleShakeCircleButton
} from "@/components/session/double-shake-circle-button";
import { sitterCompleteBooking } from "@/lib/bookings/sitter-complete-booking";
import { sitterForceEndBooking } from "@/lib/bookings/sitter-force-end-booking";
import { sitterStartShift } from "@/lib/bookings/sitter-start-shift";
import { isBookingEligibleForLiveShiftUi } from "@/lib/bookings/booking-shift-ui";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

const SITTER_ARRIVAL_LABEL = "הגעתי! התחלת משמרת";
const SITTER_WAITING_PARENT_START_LABEL = "ממתין לאישור הורה...";
const SITTER_ACTIVE_SHIFT_LABEL = "משמרת פעילה";
const SITTER_WAITING_PARENT_END_LABEL = "ממתין לאישור סיום מההורה...";

type Props = {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  onBookingUpdated: () => Promise<TodaysLinkedBookingView | null>;
  onError?: (message: string) => void;
  onForceEndSuccess?: () => void;
};

export function SitterDoubleShakeIdleCircle({
  booking,
  ready,
  onBookingUpdated,
  onError,
  onForceEndSuccess
}: Props) {
  const [busy, setBusy] = useState(false);

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

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      onError?.("יש להתחבר כדי לסיים משמרת.");
      return;
    }

    setBusy(true);
    const { row, error } = await sitterCompleteBooking(auth.supabase, auth.userId, booking.id);
    setBusy(false);

    if (error || !row) {
      onError?.(error ?? "סיום משמרת נכשל.");
      return;
    }

    await onBookingUpdated();
  }, [booking, onBookingUpdated, onError]);

  const handleForceEnd = useCallback(async () => {
    if (!booking || booking.status !== "sitter_ended") return;

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

  if (!ready) {
    return <DoubleShakeCircleButton label="טוען…" variant="disabled" presentational />;
  }

  if (!booking) {
    return (
      <DoubleShakeCircleButton label={DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL} variant="disabled" presentational />
    );
  }

  if (!isBookingEligibleForLiveShiftUi(booking)) {
    return (
      <DoubleShakeCircleButton label={DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL} variant="disabled" presentational />
    );
  }

  if (booking.status === "approved") {
    return (
      <DoubleShakeCircleButton
        label={SITTER_ARRIVAL_LABEL}
        variant="emerald"
        busy={busy}
        onClick={() => void handleArrival()}
      />
    );
  }

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
          {busy ? "מסיים משמרת…" : "סיום משמרת"}
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
          {busy ? "מדווח למערכת…" : "סיום כפוי — הורה לא מגיב"}
        </button>
      </div>
    );
  }

  return (
    <DoubleShakeCircleButton label={DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL} variant="disabled" presentational />
  );
}
