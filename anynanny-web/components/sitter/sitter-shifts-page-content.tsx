"use client";

import { useCallback, useEffect, useState } from "react";
import { DoubleShakeBookingCircle } from "@/components/session/double-shake-booking-circle";
import { SitterConfirmedShifts } from "@/components/sitter/sitter-confirmed-shifts";
import { SitterPendingBookings } from "@/components/sitter/sitter-pending-bookings";
import { StuckShiftDevResetButton } from "@/components/sitter/stuck-shift-dev-reset";
import { SITTER_FORCE_END_SUCCESS_MESSAGE } from "@/lib/bookings/constants";
import { useTodaysLinkedBooking } from "@/lib/bookings/use-todays-linked-booking";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

export function SitterShiftsPageContent() {
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmedRefreshNonce, setConfirmedRefreshNonce] = useState(0);
  const [shiftActionError, setShiftActionError] = useState<string | null>(null);
  const [forceEndToast, setForceEndToast] = useState<string | null>(null);

  const {
    booking: todaysBooking,
    ready: bookingGuardReady,
    reload: reloadTodaysBooking
  } = useTodaysLinkedBooking("sitter", sitterId);

  useEffect(() => {
    if (!forceEndToast) return;
    const t = window.setTimeout(() => setForceEndToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [forceEndToast]);

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

  const handleBookingResponded = useCallback(() => {
    setConfirmedRefreshNonce((n) => n + 1);
    void reloadTodaysBooking();
  }, [reloadTodaysBooking]);

  const handleForceEndSuccess = useCallback(async () => {
    setShiftActionError(null);
    setForceEndToast(SITTER_FORCE_END_SUCCESS_MESSAGE);
    await reloadTodaysBooking();
    setConfirmedRefreshNonce((n) => n + 1);
  }, [reloadTodaysBooking]);

  const handleDevReset = useCallback(async () => {
    setShiftActionError(null);
    await reloadTodaysBooking();
    setConfirmedRefreshNonce((n) => n + 1);
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
    <div className="space-y-5">
      {forceEndToast ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-right text-sm font-semibold text-emerald-900"
        >
          {forceEndToast}
        </p>
      ) : null}

      {shiftActionError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {shiftActionError}
        </p>
      ) : null}

      <DoubleShakeBookingCircle
        role="sitter"
        booking={todaysBooking}
        ready={bookingGuardReady}
        onBookingUpdated={reloadTodaysBooking}
        onError={setShiftActionError}
        onForceEndSuccess={() => void handleForceEndSuccess()}
      />

      <StuckShiftDevResetButton onReset={() => void handleDevReset()} />

      <SitterPendingBookings sitterId={sitterId} onResponded={handleBookingResponded} />
      <SitterConfirmedShifts sitterId={sitterId} refreshNonce={confirmedRefreshNonce} />
    </div>
  );
}
