"use client";

import { useCallback, useState } from "react";
import {
  approveBookingCancellation,
  requestBookingCancellation,
  type CancellationShiftLike
} from "@/lib/bookings/cancellation-request";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useShiftCancellationFlow(onChanged?: () => void) {
  const [requestShift, setRequestShift] = useState<CancellationShiftLike | null>(null);
  const [approveShift, setApproveShift] = useState<CancellationShiftLike | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (busy) return;
    setRequestShift(null);
    setApproveShift(null);
    setError(null);
  }, [busy]);

  const submitRequest = useCallback(
    async (message: string | null) => {
      if (!requestShift || busy) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase לא זמין");
        return;
      }
      setBusy(true);
      setError(null);
      const result = await requestBookingCancellation(supabase, requestShift.id, message);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRequestShift(null);
      onChanged?.();
    },
    [busy, onChanged, requestShift]
  );

  const submitApproval = useCallback(async () => {
    if (!approveShift || busy) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא זמין");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await approveBookingCancellation(supabase, approveShift.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setApproveShift(null);
    onChanged?.();
  }, [approveShift, busy, onChanged]);

  return {
    requestShift,
    approveShift,
    busy,
    error,
    openRequest: (shift: CancellationShiftLike) => {
      setError(null);
      setApproveShift(null);
      setRequestShift(shift);
    },
    openApprove: (shift: CancellationShiftLike) => {
      setError(null);
      setRequestShift(null);
      setApproveShift(shift);
    },
    close,
    submitRequest,
    submitApproval
  };
}
