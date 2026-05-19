"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import type { BookingRow } from "@/lib/bookings/constants";
import {
  fetchTodayBookingShiftGate,
  fetchTodaysLinkedBooking,
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useTodaysLinkedBooking(
  role: "parent" | "sitter",
  userId: string | null
): {
  booking: TodaysLinkedBookingView | null;
  /** Latest today row (any status) — gates session timer after early finish. */
  shiftGate: Pick<BookingRow, "status" | "parent_id" | "sitter_id"> | null;
  ready: boolean;
  reload: () => Promise<TodaysLinkedBookingView | null>;
} {
  const [booking, setBooking] = useState<TodaysLinkedBookingView | null>(null);
  const [shiftGate, setShiftGate] = useState<Pick<
    BookingRow,
    "status" | "parent_id" | "sitter_id"
  > | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setBooking(null);
      setShiftGate(null);
      setReady(true);
      return null;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setBooking(null);
      setShiftGate(null);
      setReady(true);
      return null;
    }
    const [linked, gate] = await Promise.all([
      fetchTodaysLinkedBooking(supabase, userId, role),
      fetchTodayBookingShiftGate(supabase, userId, role)
    ]);
    setBooking(linked.booking);
    setShiftGate(gate);
    if (linked.error) {
      console.warn(`[${role}] today's booking:`, linked.error);
    }
    setReady(true);
    return linked.booking;
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

  return { booking, shiftGate, ready, reload };
}
