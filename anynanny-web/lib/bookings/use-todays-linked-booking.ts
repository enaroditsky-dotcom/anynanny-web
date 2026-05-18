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
): {
  booking: TodaysLinkedBookingView | null;
  ready: boolean;
  reload: () => Promise<TodaysLinkedBookingView | null>;
} {
  const [booking, setBooking] = useState<TodaysLinkedBookingView | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setBooking(null);
      setReady(true);
      return null;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setBooking(null);
      setReady(true);
      return null;
    }
    const { booking: row, error } = await fetchTodaysLinkedBooking(supabase, userId, role);
    setBooking(row);
    if (error) {
      console.warn(`[${role}] today's booking:`, error);
    }
    setReady(true);
    return row;
  }, [role, userId]);

  useEffect(() => {
    setReady(false);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const column = role === "parent" ? "parent_id" : "sitter_id";
    const channel = supabase
      .channel(`todays-booking-${role}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `${column}=eq.${userId}`
        },
        () => {
          void reload();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role, userId, reload]);

  return { booking, ready, reload };
}
