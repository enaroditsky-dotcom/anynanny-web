"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DoubleShakeCircleSlot,
  DoubleShakeShiftPanel
} from "@/components/session/double-shake-circle-button";
import { SitterDoubleShakeIdleCircle } from "@/components/session/sitter-double-shake-idle-circle";
import { SitterConfirmedShifts } from "@/components/sitter/sitter-confirmed-shifts";
import { SitterPendingBookings } from "@/components/sitter/sitter-pending-bookings";
import { SitterShiftApprovalCard } from "@/components/sitter/sitter-shift-approval-card";
import { StuckShiftDevResetButton } from "@/components/sitter/stuck-shift-dev-reset";
import { bookingRowToCircleView } from "@/lib/bookings/circle-booking-state";
import { isSitterBookingAwaitingApprovalStatus } from "@/lib/bookings/booking-realtime-handler";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import type { BookingRow } from "@/lib/bookings/constants";
import type { PendingBookingView } from "@/lib/bookings/sitter-pending-bookings";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { useCircleBookingSync } from "@/lib/bookings/use-circle-booking-sync";
import {
  useTodaysLinkedBooking,
  type TodaysLinkedBookingSyncPayload
} from "@/lib/bookings/use-todays-linked-booking";
import {
  fetchTodaysPendingBookingRequest,
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";
import { normalizeBookingStatus } from "@/lib/bookings/use-shift-activation-status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

export function SitterShiftsPageContent() {
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmedRefreshNonce, setConfirmedRefreshNonce] = useState(0);
  const [shiftBanner, setShiftBanner] = useState<string | null>(null);
  const [pendingApprovalBooking, setPendingApprovalBooking] = useState<TodaysLinkedBookingView | null>(
    null
  );

  const { circleBooking, syncFromPayload, syncFromLinkedBooking, applyCircleBooking } =
    useCircleBookingSync("sitter");

  const handleBookingLiveSync = useCallback(
    (payload: TodaysLinkedBookingSyncPayload) => {
      syncFromPayload(payload);
      if (payload.booking) {
        syncFromLinkedBooking(payload.booking);
      }
    },
    [syncFromPayload, syncFromLinkedBooking]
  );

  const {
    booking: todaysBooking,
    shiftGate: todayBookingShiftGate,
    ready: bookingGuardReady,
    reload: reloadTodaysBooking
  } = useTodaysLinkedBooking("sitter", sitterId, {
    onBookingSync: handleBookingLiveSync
  });

  useEffect(() => {
    syncFromLinkedBooking(todaysBooking);
  }, [
    todaysBooking?.id,
    todaysBooking?.status,
    todaysBooking?.updated_at,
    todaysBooking?.start_time,
    todaysBooking?.end_time,
    syncFromLinkedBooking
  ]);

  const gateStatus = normalizeBookingStatus(todayBookingShiftGate?.status) ?? "";
  const showSitterApprovalStage = isSitterBookingAwaitingApprovalStatus(gateStatus);

  useEffect(() => {
    if (!sitterId || !bookingGuardReady || !showSitterApprovalStage) {
      setPendingApprovalBooking(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    void fetchTodaysPendingBookingRequest(supabase, sitterId, "sitter").then(({ booking }) => {
      if (cancelled) return;
      setPendingApprovalBooking(
        booking && isSitterBookingAwaitingApprovalStatus(booking.status) ? booking : null
      );
    });

    return () => {
      cancelled = true;
    };
  }, [sitterId, bookingGuardReady, showSitterApprovalStage, todayBookingShiftGate?.id, todayBookingShiftGate?.updated_at]);

  const activeCircleBooking = showSitterApprovalStage ? null : circleBooking ?? todaysBooking;

  const sitterCircleLiveKey = useMemo(
    () => bookingLiveSyncKey(activeCircleBooking),
    [
      activeCircleBooking?.id,
      activeCircleBooking?.status,
      activeCircleBooking?.updated_at,
      activeCircleBooking?.start_time,
      activeCircleBooking?.end_time
    ]
  );

  useEffect(() => {
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setAuthState("error");
        return;
      }
      setSitterId(auth.userId);
      setAuthState("ready");
    })();
  }, []);

  const handleBookingResponded = useCallback(
    async (result: { status: "approved" | "rejected"; booking: PendingBookingView | null }) => {
      setConfirmedRefreshNonce((n) => n + 1);
      setPendingApprovalBooking(null);

      if (result.status === "approved" && result.booking) {
        const optimistic = bookingRowToCircleView(result.booking as BookingRow, null, "sitter");
        applyCircleBooking({
          ...optimistic,
          status: "approved",
          schedule_label: formatBookingSchedule(result.booking)
        });
      } else {
        applyCircleBooking(null);
      }

      await reloadTodaysBooking();
    },
    [applyCircleBooking, reloadTodaysBooking]
  );

  const handleDevReset = useCallback(() => {
    setConfirmedRefreshNonce((n) => n + 1);
    void reloadTodaysBooking();
  }, [reloadTodaysBooking]);

  if (authState === "loading") {
    return <p className="text-right text-sm text-slate-600">טוען משמרות…</p>;
  }

  if (authState === "error" || !sitterId) {
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm text-rose-900">
        יש להתחבר כדי לצפות בבקשות ומשמרות.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DoubleShakeShiftPanel className="mb-3 shrink-0">
        {shiftBanner ? (
          <p
            role="status"
            className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right text-xs text-amber-950"
          >
            {shiftBanner}
          </p>
        ) : null}
        <DoubleShakeCircleSlot>
          {showSitterApprovalStage && pendingApprovalBooking ? (
            <SitterShiftApprovalCard
              sitterId={sitterId}
              booking={pendingApprovalBooking}
              onResponded={handleBookingResponded}
              onError={(msg) => setShiftBanner(msg)}
            />
          ) : showSitterApprovalStage ? (
            <p className="text-center text-sm text-slate-600">טוען בקשה ממתינה…</p>
          ) : (
            <SitterDoubleShakeIdleCircle
              key={sitterCircleLiveKey}
              booking={activeCircleBooking}
              ready={bookingGuardReady}
              onBookingUpdated={reloadTodaysBooking}
              onError={(msg) => setShiftBanner(msg)}
            />
          )}
        </DoubleShakeCircleSlot>
      </DoubleShakeShiftPanel>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-1 pe-0.5">
        <SitterPendingBookings sitterId={sitterId} onResponded={handleBookingResponded} />
        <SitterConfirmedShifts sitterId={sitterId} refreshNonce={confirmedRefreshNonce} />
      </div>

      <div className="shrink-0 pt-2">
        <StuckShiftDevResetButton onReset={handleDevReset} />
      </div>
    </div>
  );
}
