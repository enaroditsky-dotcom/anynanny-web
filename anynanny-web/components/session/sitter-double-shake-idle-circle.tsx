"use client";

import { useCallback, useState } from "react";
import {
  DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL,
  DoubleShakeCircleButton
} from "@/components/session/double-shake-circle-button";
import { sitterStartShift } from "@/lib/bookings/sitter-start-shift";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SITTER_ARRIVAL_LABEL = "הגעתי! התחלת משמרת";
const SITTER_WAITING_PARENT_LABEL = "ממתין לאישור הורה...";

type Props = {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  onBookingUpdated: () => Promise<TodaysLinkedBookingView | null>;
  onError?: (message: string) => void;
};

export function SitterDoubleShakeIdleCircle({ booking, ready, onBookingUpdated, onError }: Props) {
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

  if (!ready) {
    return <DoubleShakeCircleButton label="טוען…" variant="disabled" presentational />;
  }

  if (!booking) {
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
      <DoubleShakeCircleButton label={SITTER_WAITING_PARENT_LABEL} variant="disabled" presentational />
    );
  }

  return (
    <DoubleShakeCircleButton label={DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL} variant="disabled" presentational />
  );
}
