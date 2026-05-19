"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import {
  fetchPendingBookingsForSitter,
  formatBookingSchedule,
  updateBookingStatus,
  type PendingBookingView
} from "@/lib/bookings/sitter-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  sitterId: string | null;
  disabled?: boolean;
  /** Fired after approve/reject succeeds — use to refresh confirmed shifts list. */
  onResponded?: (status: "approved" | "rejected") => void;
};

export function SitterPendingBookings({ sitterId, disabled = false, onResponded }: Props) {
  const [bookings, setBookings] = useState<PendingBookingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sitterId) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadError("Supabase לא זמין");
      setLoading(false);
      return;
    }

    setLoadError(null);
    const { bookings: rows, error } = await fetchPendingBookingsForSitter(supabase, sitterId);
    setBookings(rows);
    setLoadError(error);
    setLoading(false);
  }, [sitterId]);

  useEffect(() => {
    if (!sitterId || disabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [sitterId, disabled, load]);

  useEffect(() => {
    if (!sitterId || disabled) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`sitter-bookings-${sitterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${sitterId}`
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sitterId, disabled, load]);

  const handleRespond = async (bookingId: string, status: "approved" | "rejected") => {
    if (!sitterId || actingId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא זמין");
      return;
    }

    setActionError(null);
    setActingId(bookingId);
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));

    const { error } = await updateBookingStatus(supabase, sitterId, bookingId, status);
    setActingId(null);

    if (error) {
      setActionError(error);
      void load();
      return;
    }

    onResponded?.(status);
    void load();
  };

  if (disabled || !sitterId) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft sm:p-5">
      <div className="flex flex-row-reverse items-center justify-between gap-2">
        <h2 className="text-right text-base font-bold text-[#001F3F]">בקשות ממתינות לאישור</h2>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#001F3F]/10">
          <CalendarClock className="h-5 w-5 text-[#001F3F]" aria-hidden />
        </span>
      </div>
      <p className="mt-1 text-right text-xs text-slate-600">בקשות תיאום משמרת מהורים — אשרו או דחו כדי לעדכן את היומן.</p>

      {actionError ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-right text-sm text-slate-500">טוען בקשות…</p>
      ) : loadError ? (
        <p className="mt-4 text-right text-sm text-rose-700">{loadError}</p>
      ) : bookings.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-navy-header/15 bg-[#FDFBF6]/80 px-4 py-5 text-center text-sm text-slate-500">
          אין בקשות ממתינות כרגע.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.map((booking) => {
            const busy = actingId === booking.id;
            return (
              <li
                key={booking.id}
                className="rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/90 p-4 text-right shadow-sm"
              >
                <p className="text-sm font-bold text-[#001F3F]">
                  {booking.parent_full_name ?? "הורה"}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600 tabular-nums">
                  {formatBookingSchedule(booking)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  התקבלה{" "}
                  {new Date(booking.created_at).toLocaleDateString("he-IL", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRespond(booking.id, "approved")}
                    className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                    {busy ? "מעדכנים…" : "אישור משמרת"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRespond(booking.id, "rejected")}
                    className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-white px-3 py-2.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                    דחיית משמרת
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
