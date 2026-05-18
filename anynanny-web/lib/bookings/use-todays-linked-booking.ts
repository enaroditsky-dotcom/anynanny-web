"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import {
  fetchTodaysLinkedBooking,
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useTodaysLinkedBooking(
  role: "parent" | "sitter",
  userId: string | null
) {
  const [booking, setBooking] = useState<TodaysLinkedBookingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBooking(null);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא זמין");
      setBooking(null);
      setLoading(false);
      return;
    }
    const { booking: row, error: fetchError } = await fetchTodaysLinkedBooking(supabase, userId, role);
    setBooking(row);
    setError(fetchError);
    setLoading(false);
  }, [role, userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const filterColumn = role === "parent" ? `parent_id=eq.${userId}` : `sitter_id=eq.${userId}`;
    const channel = supabase
      .channel(`todays-linked-booking-${role}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: BOOKINGS_TABLE, filter: filterColumn },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role, userId, refresh]);

  const patchBooking = useCallback((patch: Partial<TodaysLinkedBookingView>) => {
    setBooking((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return {
    booking,
    loading,
    error,
    refresh,
    patchBooking,
    hasLinkedShift: booking != null
  };
}
