"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { fetchConfirmedShiftsForSitter } from "@/lib/bookings/sitter-confirmed-shifts";
import { countSitterShiftsInCurrentWeek } from "@/lib/bookings/sitter-upcoming-week-shifts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

/** Live count of this sitter's confirmed shifts in the current calendar week. Null until a read succeeds. */
export function useSitterUpcomingWeekShiftCount(sitterId: string | null, enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!sitterId || !enabled) {
      setCount(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { shifts, error } = await fetchConfirmedShiftsForSitter(supabase, sitterId);
    if (error) return;
    setCount(countSitterShiftsInCurrentWeek(shifts));
  }, [sitterId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sitterId || !enabled) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `sitter-week-shift-count-${sitterId}`, {
      event: "*",
      table: BOOKINGS_TABLE,
      filter: `sitter_id=eq.${sitterId}`,
      handler: () => {
        void refresh();
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [sitterId, enabled, refresh]);

  return count;
}
