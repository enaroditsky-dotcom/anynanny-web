"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CalendarClock, Check, X } from "lucide-react";
import type {
  RealtimePostgresChangesPayload,
  RealtimePostgresDeletePayload
} from "@supabase/supabase-js";
import { ActionToast } from "@/components/ui/action-toast";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import {
  fetchPendingBookingsForSitter,
  formatBookingSchedule,
  updateBookingStatus,
  type PendingBookingView
} from "@/lib/bookings/sitter-pending-bookings";
import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift,
  SITTER_OVERLAP_APPROVE_MESSAGE
} from "@/lib/bookings/sitter-shift-overlap";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const NEW_BOOKING_TOAST_MS = 6000;

function tryVibrate(pattern: number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* haptics best-effort */
  }
}

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
  const [newBookingFlash, setNewBookingFlash] = useState(false);
  const [respondToast, setRespondToast] = useState<string | null>(null);
  const [respondToastApproved, setRespondToastApproved] = useState(true);
  const initialLoadDoneRef = useRef(false);

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
    initialLoadDoneRef.current = false;
    void load().then(() => {
      initialLoadDoneRef.current = true;
    });
  }, [sitterId, disabled, load]);

  useEffect(() => {
    if (!newBookingFlash) return;
    const id = window.setTimeout(() => setNewBookingFlash(false), NEW_BOOKING_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [newBookingFlash]);

  useEffect(() => {
    if (!respondToast) return;
    const id = window.setTimeout(() => setRespondToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [respondToast]);

  useEffect(() => {
    if (!sitterId || disabled) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const handleInsert = (
      payload: RealtimePostgresChangesPayload<BookingRow>
    ) => {
      const row = (payload.new ?? null) as BookingRow | null;
      if (!row || row.status !== "pending") {
        void load();
        return;
      }
      let appended = false;
      setBookings((prev) => {
        if (prev.some((b) => b.id === row.id)) return prev;
        appended = true;
        const optimistic: PendingBookingView = {
          ...row,
          parent_full_name: null
        };
        return [optimistic, ...prev];
      });
      if (appended && initialLoadDoneRef.current) {
        setNewBookingFlash(true);
        tryVibrate([140, 70, 140]);
      }
      void load();
    };

    const handleUpdate = (
      payload: RealtimePostgresChangesPayload<BookingRow>
    ) => {
      const row = (payload.new ?? null) as BookingRow | null;
      if (row && row.status !== "pending") {
        setBookings((prev) => prev.filter((b) => b.id !== row.id));
        return;
      }
      void load();
    };

    const handleDelete = (
      payload: RealtimePostgresDeletePayload<BookingRow>
    ) => {
      const old = (payload.old ?? null) as Partial<BookingRow> | null;
      if (old?.id) {
        setBookings((prev) => prev.filter((b) => b.id !== old.id));
      }
    };

    const channel = supabase
      .channel(`sitter-bookings-${sitterId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${sitterId}`
        },
        handleInsert
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${sitterId}`
        },
        handleUpdate
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${sitterId}`
        },
        handleDelete
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

    const target = bookings.find((b) => b.id === bookingId);

    if (status === "approved" && target) {
      const proposedWindow = resolveShiftTimeWindow(target);
      if (proposedWindow) {
        const hasOverlap = await sitterHasOverlappingActiveShift(
          supabase,
          sitterId,
          proposedWindow,
          { bookingId }
        );
        if (hasOverlap) {
          window.alert(SITTER_OVERLAP_APPROVE_MESSAGE);
          return;
        }
      }
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

    setRespondToast(
      status === "approved" ? "המשמרת אושרה בהצלחה" : "המשמרת נדחתה — ההורה יקבל עדכון"
    );
    setRespondToastApproved(status === "approved");
    tryVibrate(status === "approved" ? [100, 50, 100] : [80, 40, 80]);

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

      {newBookingFlash ? (
        <div
          role="status"
          aria-live="assertive"
          className="mt-3 flex flex-row-reverse items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-right text-xs font-semibold text-emerald-900 shadow-sm"
        >
          <BellRing className="h-4 w-4 shrink-0" aria-hidden />
          <span>התקבלה בקשה חדשה — נוספה לרשימה למעלה</span>
        </div>
      ) : null}

      {respondToast ? (
        <div
          role="status"
          aria-live="assertive"
          className={`mt-3 flex flex-row-reverse items-center gap-2 rounded-xl border px-3 py-2 text-right text-xs font-semibold shadow-sm ${
            respondToastApproved
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          {respondToastApproved ? (
            <Check className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <X className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{respondToast}</span>
        </div>
      ) : null}

      <ActionToast
        message={respondToast}
        variant={respondToastApproved ? "success" : "error"}
        onDismiss={() => setRespondToast(null)}
      />

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
