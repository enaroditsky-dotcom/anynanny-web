"use client";

import { useCallback, useEffect, useState } from "react";
import { SitterConfirmedShifts } from "@/components/sitter/sitter-confirmed-shifts";
import { SitterPendingBookings } from "@/components/sitter/sitter-pending-bookings";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

export function SitterShiftsPageContent() {
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmedRefreshNonce, setConfirmedRefreshNonce] = useState(0);

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
  }, []);

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
      <SitterPendingBookings sitterId={sitterId} onResponded={handleBookingResponded} />
      <SitterConfirmedShifts sitterId={sitterId} refreshNonce={confirmedRefreshNonce} />
    </div>
  );
}
