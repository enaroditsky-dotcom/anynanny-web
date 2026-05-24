"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { circleBookingsEqual } from "@/lib/bookings/circle-booking-state";
import { didBookingLiveFieldsChange } from "@/lib/bookings/booking-live-key";
import { isBookingTerminalStatus } from "@/lib/bookings/booking-shift-ui";
import { isBookingDateToday } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import {
  normalizeBookingStatus,
  type BookingStatusInput
} from "@/lib/bookings/use-shift-activation-status";
import {
  fetchTodayBookingShiftGate,
  fetchTodaysLinkedBooking,
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type TodaysLinkedBookingSyncPayload = {
  booking: TodaysLinkedBookingView | null;
  shiftGate: Pick<BookingRow, "status" | "parent_id" | "sitter_id"> | null;
  row: BookingRow | null;
  source: "realtime" | "reload";
  /** True when `status` or `updated_at` changed on the tracked booking row. */
  liveFieldsChanged: boolean;
};

export type UseTodaysLinkedBookingOptions = {
  onBookingSync?: (payload: TodaysLinkedBookingSyncPayload) => void;
  /** When true, skip booking realtime subscription (e.g. shift already completed). */
  freezeBookingRealtime?: boolean;
};

function isBookingRowForUser(
  row: Partial<BookingRow>,
  role: "parent" | "sitter",
  userId: string
): boolean {
  const column = role === "parent" ? "parent_id" : "sitter_id";
  return String(row[column] ?? "") === userId;
}

function shiftGateFromRow(
  row: Pick<BookingRow, "status" | "parent_id" | "sitter_id">
): Pick<BookingRow, "status" | "parent_id" | "sitter_id"> {
  return {
    status: row.status,
    parent_id: row.parent_id,
    sitter_id: row.sitter_id
  };
}

function shiftGateEqual(
  a: Pick<BookingRow, "status" | "parent_id" | "sitter_id"> | null,
  b: Pick<BookingRow, "status" | "parent_id" | "sitter_id"> | null
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.status === b.status && a.parent_id === b.parent_id && a.sitter_id === b.sitter_id;
}

function normalizeBookingRow(row: BookingRow): BookingRow {
  return {
    ...row,
    status: normalizeBookingStatus(row.status as BookingStatusInput) ?? row.status
  };
}

function minimalLinkedBooking(
  row: BookingRow,
  role: "parent" | "sitter"
): TodaysLinkedBookingView {
  const normalized = normalizeBookingRow(row);
  return {
    ...normalized,
    schedule_label: "",
    partner_user_id: role === "parent" ? normalized.sitter_id : normalized.parent_id,
    partner_full_name: null,
    partner_sitter_code: null
  };
}

function resolveNextBooking(
  prev: TodaysLinkedBookingView | null,
  row: BookingRow,
  role: "parent" | "sitter"
): TodaysLinkedBookingView | null {
  const normalized = normalizeBookingRow(row);

  if (isBookingTerminalStatus(normalized.status)) {
    return prev?.id === normalized.id ? null : prev;
  }

  if (prev?.id === normalized.id) {
    return {
      ...prev,
      ...normalized,
      start_time: normalized.start_time ?? prev.start_time,
      end_time: normalized.end_time ?? prev.end_time,
      booking_date: normalized.booking_date ?? prev.booking_date,
      schedule_label: prev.schedule_label,
      partner_user_id: prev.partner_user_id,
      partner_full_name: prev.partner_full_name,
      partner_sitter_code: prev.partner_sitter_code
    };
  }

  return minimalLinkedBooking(normalized, role);
}

export function useTodaysLinkedBooking(
  role: "parent" | "sitter",
  userId: string | null,
  options?: UseTodaysLinkedBookingOptions
): {
  booking: TodaysLinkedBookingView | null;
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

  const onBookingSyncRef = useRef(options?.onBookingSync);
  onBookingSyncRef.current = options?.onBookingSync;

  const liveSnapshotRef = useRef<Pick<BookingRow, "id" | "status" | "updated_at"> | null>(
    null
  );
  const completedRealtimeFrozenRef = useRef(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const notifySync = useCallback(
    (
      nextBooking: TodaysLinkedBookingView | null,
      nextGate: Pick<BookingRow, "status" | "parent_id" | "sitter_id"> | null,
      row: BookingRow | null,
      source: TodaysLinkedBookingSyncPayload["source"],
      liveFieldsChanged: boolean
    ) => {
      onBookingSyncRef.current?.({
        booking: nextBooking,
        shiftGate: nextGate,
        row,
        source,
        liveFieldsChanged
      });
    },
    []
  );

  const emitLiveSnapshot = useCallback(
    (
      nextBooking: TodaysLinkedBookingView | null,
      nextGate: Pick<BookingRow, "status" | "parent_id" | "sitter_id"> | null,
      row: BookingRow | null,
      source: TodaysLinkedBookingSyncPayload["source"]
    ) => {
      const candidate = row ?? nextBooking;
      const liveFieldsChanged = didBookingLiveFieldsChange(liveSnapshotRef.current, candidate);

      if (candidate?.id && candidate.status) {
        liveSnapshotRef.current = {
          id: candidate.id,
          status: candidate.status,
          updated_at: candidate.updated_at
        };
      } else if (!nextBooking) {
        liveSnapshotRef.current = null;
      }

      notifySync(nextBooking, nextGate, row, source, liveFieldsChanged);
    },
    [notifySync]
  );

  const reload = useCallback(async () => {
    if (!userId) {
      setBooking((prev) => {
        if (prev === null) return prev;
        return null;
      });
      setShiftGate((prev) => {
        if (prev === null) return prev;
        return null;
      });
      setReady(true);
      emitLiveSnapshot(null, null, null, "reload");
      return null;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setBooking((prev) => (prev === null ? prev : null));
      setShiftGate((prev) => (prev === null ? prev : null));
      setReady(true);
      emitLiveSnapshot(null, null, null, "reload");
      return null;
    }

    const [linked, gate] = await Promise.all([
      fetchTodaysLinkedBooking(supabase, userId, role),
      fetchTodayBookingShiftGate(supabase, userId, role)
    ]);

    const nextBooking = linked.booking;
    const nextStatus = normalizeBookingStatus(nextBooking?.status as BookingStatusInput);
    if (nextStatus === "completed") {
      completedRealtimeFrozenRef.current = true;
    }

    setBooking((prev) => (circleBookingsEqual(prev, nextBooking) ? prev : nextBooking));
    setShiftGate((prev) => (shiftGateEqual(prev, gate) ? prev : gate));

    if (linked.error) {
      console.warn(`[${role}] today's booking:`, linked.error);
    }

    setReady(true);
    emitLiveSnapshot(nextBooking, gate, nextBooking, "reload");
    return nextBooking;
  }, [role, userId, emitLiveSnapshot]);

  const applyRealtimePatch = useCallback(
    (payload: RealtimePostgresChangesPayload<BookingRow>) => {
      if (!userId) return;

      if (payload.eventType === "DELETE") {
        const oldRow = (payload.old ?? null) as Partial<BookingRow> | null;
        if (!oldRow?.id || !isBookingRowForUser(oldRow, role, userId)) return;

        let nextBooking: TodaysLinkedBookingView | null = null;
        setBooking((prev) => {
          nextBooking = prev?.id === oldRow.id ? null : prev;
          return nextBooking;
        });
        setShiftGate((prev) => (prev === null ? prev : null));
        emitLiveSnapshot(nextBooking, null, null, "realtime");
        return;
      }

      const row = (payload.new ?? null) as BookingRow | null;
      if (!row?.id || !isBookingRowForUser(row, role, userId)) return;
      if (row.booking_date && !isBookingDateToday(row.booking_date)) return;

      const incomingStatus = normalizeBookingStatus(row.status as BookingStatusInput);
      if (incomingStatus === "completed") {
        if (completedRealtimeFrozenRef.current) return;
        completedRealtimeFrozenRef.current = true;
        const gate = shiftGateFromRow(row);
        setBooking((prev) => (prev?.id === row.id ? null : prev));
        setShiftGate((prev) => (shiftGateEqual(prev, gate) ? prev : gate));
        emitLiveSnapshot(null, gate, row, "realtime");
        return;
      }

      if (completedRealtimeFrozenRef.current || optionsRef.current?.freezeBookingRealtime) {
        return;
      }

      const gate = shiftGateFromRow(row);
      let nextBooking: TodaysLinkedBookingView | null = null;

      setBooking((prev) => {
        const resolved = resolveNextBooking(prev, row, role);
        nextBooking = circleBookingsEqual(prev, resolved) ? prev : resolved;
        return nextBooking;
      });

      setShiftGate((prev) => (shiftGateEqual(prev, gate) ? prev : gate));
      emitLiveSnapshot(nextBooking, gate, row, "realtime");
    },
    [role, userId, emitLiveSnapshot]
  );

  const linkedBookingStatus = normalizeBookingStatus(booking?.status as BookingStatusInput) ?? "";

  useEffect(() => {
    if (linkedBookingStatus === "completed") {
      completedRealtimeFrozenRef.current = true;
    }
  }, [linkedBookingStatus]);

  useEffect(() => {
    setReady(false);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    if (completedRealtimeFrozenRef.current || linkedBookingStatus === "completed") {
      return;
    }
    if (optionsRef.current?.freezeBookingRealtime) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const column = role === "parent" ? "parent_id" : "sitter_id";

    const handleChange = (payload: RealtimePostgresChangesPayload<BookingRow>) => {
      applyRealtimePatch(payload);
    };

    const channel = supabase
      .channel(`todays-booking-${role}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `${column}=eq.${userId}`
        },
        handleChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `${column}=eq.${userId}`
        },
        handleChange
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `${column}=eq.${userId}`
        },
        handleChange
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void reload();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [role, userId, reload, applyRealtimePatch, linkedBookingStatus, options?.freezeBookingRealtime]);

  return { booking, shiftGate, ready, reload };
}
