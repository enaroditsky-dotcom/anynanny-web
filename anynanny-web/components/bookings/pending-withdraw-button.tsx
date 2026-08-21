"use client";

import { useCallback, useState } from "react";
import {
  PENDING_WITHDRAW_COPY,
  withdrawPendingBooking
} from "@/lib/bookings/withdraw-pending-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PendingWithdrawButtonProps = {
  bookingId: string;
  disabled?: boolean;
  className?: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function PendingWithdrawButton({
  bookingId,
  disabled = false,
  className = "",
  onSuccess,
  onError
}: PendingWithdrawButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy || disabled || !bookingId.trim()) return;
    if (!window.confirm(PENDING_WITHDRAW_COPY.confirm)) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      onError?.(PENDING_WITHDRAW_COPY.genericError);
      return;
    }

    setBusy(true);
    const result = await withdrawPendingBooking(supabase, bookingId);
    setBusy(false);

    if (!result.ok) {
      onError?.(result.error);
      return;
    }

    onSuccess?.();
  }, [bookingId, busy, disabled, onError, onSuccess]);

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy || disabled}
      className={
        className ||
        "text-xs font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-800 disabled:opacity-50"
      }
    >
      {busy ? PENDING_WITHDRAW_COPY.busy : PENDING_WITHDRAW_COPY.action}
    </button>
  );
}
