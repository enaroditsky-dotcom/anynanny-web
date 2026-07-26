"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { circleBookingsEqual } from "@/lib/bookings/circle-booking-state";
import { readBookingRowFromRealtimeChange } from "@/lib/bookings/booking-realtime-handler";
import { didBookingLiveFieldsChange } from "@/lib/bookings/booking-live-key";
import { isBookingTerminalStatus } from "@/lib/bookings/booking-shift-ui";
import { isSitterBookingAwaitingApprovalStatus } from "@/lib/bookings/booking-realtime-handler";
import { isBookingRelevantForLiveSync } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import {
  normalizeBookingStatus,
  type BookingStatusInput
} from "@/lib/bookings/use-shift-activation-status";
import {
  fetchLinkedBookingById,
  fetchParentTodayBookingBundle,
  fetchTodayBookingShiftGate,
  fetchTodaysLinkedBooking,
  fetchTodaysPendingBookingRequest,
  type TodayBookingShiftGate,
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

export type TodaysLinkedBookingSyncPayload = {
  booking: TodaysLinkedBookingView | null;
  shiftGate: TodayBookingShiftGate | null;
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
  row: Pick<BookingRow, "id" | "status" | "parent_id" | "sitter_id">
): TodayBookingShiftGate {
  return {
    id: row.id,
    status: row.status,
    parent_id: row.parent_id,
    sitter_id: row.sitter_id
  };
}

function shiftGateEqual(a: TodayBookingShiftGate | null, b: TodayBookingShiftGate | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.parent_id === b.parent_id &&
    a.sitter_id === b.sitter_id
  );
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
  shiftGate: TodayBookingShiftGate | null;
  ready: boolean;
  reload: () => Promise<TodaysLinkedBookingView | null>;
} {
  const [booking, setBooking] = useState<TodaysLinkedBookingView | null>(null);
  const [shiftGate, setShiftGate] = useState<TodayBookingShiftGate | null>(null);
  const [ready, setReady] = useState(false);

  const onBookingSyncRef = useRef(options?.onBookingSync);
  onBookingSyncRef.current = options?.onBookingSync;

  const liveSnapshotRef = useRef<Pick<BookingRow, "id" | "status" | "updated_at"> | null>(
    null
  );
  const completedRealtimeFrozenRef = useRef(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reloadRef = useRef<() => Promise<TodaysLinkedBookingView | null>>(async () => null);

  const notifySync = useCallback(
    (
      nextBooking: TodaysLinkedBookingView | null,
      nextGate: TodayBookingShiftGate | null,
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
      nextGate: TodayBookingShiftGate | null,
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

    let nextBooking: TodaysLinkedBookingView | null = null;
    let gate: TodayBookingShiftGate | null = null;
    let fetchError: string | null = null;

    if (role === "parent") {
      const bundle = await fetchParentTodayBookingBundle(supabase, userId);
      nextBooking = bundle.booking;
      gate = bundle.gate;
      fetchError = bundle.error;
    } else {
      const [linked, gateRow] = await Promise.all([
        fetchTodaysLinkedBooking(supabase, userId, role),
        fetchTodayBookingShiftGate(supabase, userId, role)
      ]);

      nextBooking = linked.booking;
      gate = gateRow;
      fetchError = linked.error;

      if (!nextBooking) {
        // Linked statuses include pending, but also fall back to an explicit pending fetch
        // so a just-inserted request is never missed on soft navigation.
        const pendingResult = await fetchTodaysPendingBookingRequest(supabase, userId, "sitter");
        if (pendingResult.booking) {
          nextBooking = pendingResult.booking;
          gate = shiftGateFromRow(pendingResult.booking);
        } else if (gate?.id) {
          // Recover approved/in-progress shifts even if the date-scoped linked fetch missed them.
          nextBooking = await fetchLinkedBookingById(supabase, gate.id, role);
        }
      } else if (!gate) {
        gate = shiftGateFromRow(nextBooking);
      }
    }
    const nextStatus = normalizeBookingStatus(nextBooking?.status as BookingStatusInput);
    if (nextStatus === "completed") {
      completedRealtimeFrozenRef.current = true;
    } else {
      // Idle / pending / live — keep realtime open for the next request.
      completedRealtimeFrozenRef.current = false;
    }

    setBooking((prev) => (circleBookingsEqual(prev, nextBooking) ? prev : nextBooking));
    setShiftGate((prev) => (shiftGateEqual(prev, gate) ? prev : gate));

    if (fetchError) {
      console.warn(`[${role}] today's booking:`, fetchError);
    }

    setReady(true);
    emitLiveSnapshot(nextBooking, gate, nextBooking, "reload");
    return nextBooking;
  }, [role, userId, emitLiveSnapshot]);

  reloadRef.current = reload;

  const applyRealtimePatch = useCallback(
    (payload: RealtimePostgresChangesPayload<BookingRow>) => {
      if (!userId) return;

      const row = readBookingRowFromRealtimeChange(payload);
      if (!row?.id) return;

      if (payload.eventType === "DELETE") {
        if (!isBookingRowForUser(row, role, userId)) return;

        let nextBooking: TodaysLinkedBookingView | null = null;
        setBooking((prev) => {
          nextBooking = prev?.id === row.id ? null : prev;
          return nextBooking;
        });
        setShiftGate((prev) => (prev?.id === row.id ? null : prev));
        if (!nextBooking) {
          completedRealtimeFrozenRef.current = false;
        }
        emitLiveSnapshot(nextBooking, null, null, "realtime");
        void reloadRef.current();
        return;
      }

      if (!isBookingRowForUser(row, role, userId)) return;

      const incomingStatus = normalizeBookingStatus(row.status as BookingStatusInput);

      // New / revived pending asks must always unfreeze realtime and surface.
      if (incomingStatus === "pending" || isSitterBookingAwaitingApprovalStatus(incomingStatus)) {
        completedRealtimeFrozenRef.current = false;
      }

      if (!isBookingRelevantForLiveSync(row)) return;

      if (incomingStatus === "completed") {
        // Freeze only this completed shift — do not kill the channel for future inserts.
        const gate = shiftGateFromRow(row);
        setBooking((prev) => (prev?.id === row.id ? null : prev));
        setShiftGate((prev) => (shiftGateEqual(prev, gate) ? prev : gate));
        emitLiveSnapshot(null, gate, row, "realtime");
        return;
      }

      if (optionsRef.current?.freezeBookingRealtime) {
        return;
      }

      // Clear freeze once a non-completed live booking arrives for this user.
      completedRealtimeFrozenRef.current = false;

      const gate = shiftGateFromRow(row);
      let nextBooking: TodaysLinkedBookingView | null = null;
      const liveFieldsChanged = didBookingLiveFieldsChange(liveSnapshotRef.current, row);

      setBooking((prev) => {
        const resolved = resolveNextBooking(prev, row, role);
        nextBooking = circleBookingsEqual(prev, resolved) ? prev : resolved;
        return nextBooking;
      });

      setShiftGate((prev) => (shiftGateEqual(prev, gate) ? prev : gate));
      emitLiveSnapshot(nextBooking, gate, row, "realtime");

      // Reload to enrich partner name/schedule; optimistic pending row already shown above.
      if (liveFieldsChanged || incomingStatus === "pending") {
        void reloadRef.current();
      }
    },
    [role, userId, emitLiveSnapshot]
  );

  const linkedBookingStatus = normalizeBookingStatus(booking?.status as BookingStatusInput) ?? "";

  useEffect(() => {
    // Only freeze while the *current* linked booking is completed — idle unfreezes.
    if (linkedBookingStatus === "completed") {
      completedRealtimeFrozenRef.current = true;
    } else if (!linkedBookingStatus) {
      completedRealtimeFrozenRef.current = false;
    }
  }, [linkedBookingStatus]);

  useEffect(() => {
    setReady(false);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    if (optionsRef.current?.freezeBookingRealtime) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const column = role === "parent" ? "parent_id" : "sitter_id";

    const handleChange = (payload: RealtimePostgresChangesPayload<BookingRow>) => {
      applyRealtimePatch(payload);
    };

    // Always keep a live channel for this sitter/parent — never tear it down after a
    // completed shift or new pending inserts will require a manual refresh.
    const channel = subscribePostgresChanges(
      supabase,
      `todays-booking-${role}-${userId}`,
      {
        event: "*",
        table: BOOKINGS_TABLE,
        filter: `${column}=eq.${userId}`,
        handler: handleChange
      },
      (status) => {
        if (status === "SUBSCRIBED") {
          void reload();
        }
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [role, userId, reload, applyRealtimePatch, options?.freezeBookingRealtime]);

  return { booking, shiftGate, ready, reload };
}
