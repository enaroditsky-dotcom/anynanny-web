"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { fetchPendingBookingsForSitter } from "@/lib/bookings/sitter-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Live count of pending booking requests for the sitter dashboard badge. */
export function useSitterPendingBookingCount(sitterId: string | null, enabled = true): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!sitterId || !enabled) {
      setCount(0);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { bookings } = await fetchPendingBookingsForSitter(supabase, sitterId);
    setCount(bookings.length);
  }, [sitterId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sitterId || !enabled) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`sitter-pending-count-${sitterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${sitterId}`
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sitterId, enabled, refresh]);

  return count;
}
