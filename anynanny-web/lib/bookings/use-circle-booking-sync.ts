"use client";

import { useCallback, useRef, useState } from "react";
import {
  circleBookingsEqual,
  resolveCircleBookingFromSync
} from "@/lib/bookings/circle-booking-state";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import type { TodaysLinkedBookingSyncPayload } from "@/lib/bookings/use-todays-linked-booking";
import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/use-shift-activation-status";
import { isSitterBookingAwaitingApprovalStatus } from "@/lib/bookings/booking-realtime-handler";

function isHardTerminalCircleStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized === "rejected" || normalized === "cancelled" || normalized === "completed";
}

function isLinkedShiftGateStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return (
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "sitter_started" ||
    normalized === "parent_started" ||
    normalized === "sitter_ended"
  );
}

export function useCircleBookingSync(role: "parent" | "sitter") {
  const bookingRef = useRef<TodaysLinkedBookingView | null>(null);
  const [circleBooking, setCircleBooking] = useState<TodaysLinkedBookingView | null>(null);

  const applyCircleBooking = useCallback((next: TodaysLinkedBookingView | null) => {
    if (next && isHardTerminalCircleStatus(next.status)) {
      next = null;
    }

    if (role === "sitter" && next && isSitterBookingAwaitingApprovalStatus(next.status)) {
      next = null;
    }

    if (circleBookingsEqual(bookingRef.current, next)) {
      return false;
    }

    bookingRef.current = next;
    setCircleBooking(next);
    return true;
  }, []);

  const syncFromPayload = useCallback(
    (payload: TodaysLinkedBookingSyncPayload) => {
      const resolved = resolveCircleBookingFromSync(payload, bookingRef.current, role);

      if (payload.booking === null && payload.row === null && payload.source === "reload") {
        if (isLinkedShiftGateStatus(payload.shiftGate?.status)) {
          return false;
        }
        return applyCircleBooking(null);
      }

      if (!resolved) {
        if (payload.row?.status && isHardTerminalCircleStatus(payload.row.status)) {
          return applyCircleBooking(null);
        }
        return false;
      }

      return applyCircleBooking(resolved);
    },
    [applyCircleBooking, role]
  );

  const syncFromLinkedBooking = useCallback(
    (booking: TodaysLinkedBookingView | null) => {
      // Keep existing circle when a reload briefly returns null — only clear via explicit terminal sync.
      if (!booking) return false;

      return syncFromPayload({
        booking,
        shiftGate: null,
        row: booking,
        source: "reload",
        liveFieldsChanged: true
      });
    },
    [syncFromPayload]
  );

  return {
    circleBooking,
    bookingRef,
    applyCircleBooking,
    syncFromPayload,
    syncFromLinkedBooking
  };
}
