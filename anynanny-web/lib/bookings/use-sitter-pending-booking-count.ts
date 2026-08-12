"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { fetchPendingBookingsForSitter } from "@/lib/bookings/sitter-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

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

    // הוספת השהיה קטנה למניעת מצב שבו השאילתא רצה לפני שהשרת סיים לעדכן את הסטטוס
    await new Promise((resolve) => setTimeout(resolve, 150));

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

    const channel = subscribePostgresChanges(supabase, `sitter-pending-count-${sitterId}`, {
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