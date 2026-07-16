"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Square } from "lucide-react";
import { isBookingDateToday } from "@/lib/bookings/booking-date-utils";
import { cancelSitterUpcomingShift } from "@/lib/bookings/cancel-sitter-shift";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import {
  fetchConfirmedShiftsForSitter,
  type ConfirmedShiftView
} from "@/lib/bookings/sitter-confirmed-shifts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

const CANCEL_SHIFT_CONFIRM_MESSAGE = "האם לבטל ולמחוק משמרת זו?";

/** Upcoming confirmed shifts that have not started yet. */
function canCancelShift(status: BookingStatus | string): boolean {
  return status === "approved";
}

function ShiftCard({
  shift,
  showCancel = false,
  cancelBusy = false,
  onCancel = () => {}
}: {
  shift: ConfirmedShiftView;
  showCancel?: boolean;
  cancelBusy?: boolean;
  onCancel?: () => void;
}) {
  const isPast = new Date(shift.end_time).getTime() < Date.now();
  const isToday = isBookingDateToday(shift.booking_date);
  const isSitterStarted = shift.status === "sitter_started";
  const isParentStarted = shift.status === "parent_started";
  const isSitterEnded = shift.status === "sitter_ended";

  return (
    <li
      className={`rounded-2xl border p-4 text-right shadow-sm ${
        isPast ? "border-slate-200 bg-slate-50/80 opacity-80" : "border-navy-header/12 bg-white"
      }`}
    >
      <div className="flex flex-row-reverse items-start justify-between gap-2">
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isSitterEnded
                ? "bg-rose-100 text-rose-900"
                : isSitterStarted
                  ? "bg-amber-100 text-amber-900"
                  : isParentStarted
                    ? "bg-sky-100 text-sky-900"
                    : isPast
                      ? "bg-slate-200 text-slate-700"
                      : "bg-emerald-100 text-emerald-900"
            }`}
          >
            {isSitterEnded
              ? "ממתין לאישור סיום"
              : isSitterStarted
                ? "ממתין לאישור הורה"
                : isParentStarted
                  ? "משמרת פעילה"
                  : isPast
                    ? "הסתיימה"
                    : "קרובה"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#001F3F]">{shift.parent_full_name ?? "הורה"}</p>
          <p className="mt-1 text-xs font-medium text-slate-600 tabular-nums">{shift.schedule_label}</p>
        </div>
        <CalendarClock className="h-5 w-5 shrink-0 text-[#001F3F]/70" aria-hidden />
      </div>

      {showCancel ? (
        <div className="mt-3 flex flex-row-reverse items-center justify-start border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled={cancelBusy}
            onClick={onCancel}
            className="text-sm font-semibold text-red-600 underline-offset-2 transition hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {cancelBusy ? "מבטל משמרת…" : "ביטול משמרת"}
          </button>
        </div>
      ) : null}

      {isToday && !isPast ? (
        <p className="mt-3 text-xs text-slate-500">
          התחלת משמרת להיום — השתמשו בכפתור העגול Double-Shake למעלה.
        </p>
      ) : null}

      <div className="mt-3">
        <button
          type="button"
          disabled
          title="אימות סיום משמרת — יופעל בקרוב"
          className="inline-flex w-full flex-row-reverse items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 opacity-60"
        >
          <Square className="h-4 w-4" aria-hidden />
          סיום משמרת
        </button>
      </div>
    </li>
  );
}

type SitterConfirmedShiftsProps = {
  sitterId?: string | null;
  /** Increment to force reload (e.g. after approving a pending request). */
  refreshNonce?: number;
  disabled?: boolean;
};

export function SitterConfirmedShifts({
  sitterId: sitterIdProp = null,
  refreshNonce = 0,
  disabled = false
}: SitterConfirmedShiftsProps) {
  const router = useRouter();
  const [sitterId, setSitterId] = useState<string | null>(sitterIdProp);
  const [shifts, setShifts] = useState<ConfirmedShiftView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const load = useCallback(async (uid: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא זמין");
      setLoading(false);
      return;
    }
    const { shifts: rows, error: fetchError } = await fetchConfirmedShiftsForSitter(supabase, uid);
    setShifts(rows);
    setError(fetchError);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setError("יש להתחבר כדי לראות משמרות.");
        setLoading(false);
        return;
      }
      setSitterId(auth.userId);
      await load(auth.userId);
    })();
  }, [disabled, load]);

  const effectiveSitterId = sitterIdProp ?? sitterId;

  useEffect(() => {
    if (disabled || !effectiveSitterId) return;
    setLoading(true);
    void load(effectiveSitterId);
  }, [disabled, effectiveSitterId, load, refreshNonce]);

  useEffect(() => {
    if (disabled || !effectiveSitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `sitter-confirmed-bookings-${effectiveSitterId}`, {
      event: "*",
      table: BOOKINGS_TABLE,
      filter: `sitter_id=eq.${effectiveSitterId}`,
      handler: () => {
        void load(effectiveSitterId);
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [disabled, effectiveSitterId, load]);

  const handleCancelShift = useCallback(
    async (shift: ConfirmedShiftView) => {
      if (!canCancelShift(shift.status) || cancelBusyId) return;
      if (!window.confirm(CANCEL_SHIFT_CONFIRM_MESSAGE)) return;

      const supabase = getSupabaseBrowserClient();
      if (!supabase || !effectiveSitterId) {
        setCancelError("Supabase לא זמין");
        return;
      }

      setCancelError(null);
      setCancelBusyId(shift.id);

      const result = await cancelSitterUpcomingShift(supabase, effectiveSitterId, shift.id);

      setCancelBusyId(null);

      if (!result.ok) {
        setCancelError(result.error);
        return;
      }

      setShifts((prev) => prev.filter((row) => row.id !== shift.id));
      router.refresh();
    },
    [cancelBusyId, effectiveSitterId, router]
  );

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: ConfirmedShiftView[] = [];
    const old: ConfirmedShiftView[] = [];
    for (const s of shifts) {
      if (new Date(s.end_time).getTime() >= now) up.push(s);
      else old.push(s);
    }
    old.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    return { upcoming: up, past: old };
  }, [shifts]);

  if (disabled) {
    return null;
  }

  if (loading) {
    return <p className="text-right text-sm text-slate-600">טוען לוח משמרות…</p>;
  }

  if (error) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm text-rose-900">{error}</p>;
  }

  return (
    <section className="mx-1 space-y-4">
      <p className="rounded-2xl border border-navy-header/10 bg-white px-4 py-3 text-right text-xs text-slate-600 shadow-sm">
        מוצגות משמרות <span className="font-semibold text-[#001F3F]">מאושרות</span> ומשמרות שהתחלתם — מטבלת
        הבקשות.
      </p>

      {cancelError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {cancelError}
        </p>
      ) : null}

      {upcoming.length === 0 && past.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-navy-header/15 bg-white px-4 py-10 text-center shadow-sm">
          <CalendarClock className="mx-auto h-8 w-8 text-navy-header/50" />
          <p className="mt-3 text-sm font-semibold text-[#001F3F]">אין משמרות מאושרות עדיין</p>
          <p className="mt-1 text-xs text-slate-500">לאחר אישור בקשה ממתינה למעלה, המשמרת תופיע כאן.</p>
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div>
          <h2 className="mb-2 text-right text-sm font-bold text-[#001F3F]">משמרות קרובות</h2>
          <ul className="space-y-3">
            {upcoming.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                showCancel={canCancelShift(shift.status)}
                cancelBusy={cancelBusyId === shift.id}
                onCancel={() => void handleCancelShift(shift)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {past.length > 0 ? (
        <div>
          <h2 className="mb-2 text-right text-sm font-bold text-slate-700">היסטוריה אחרונה</h2>
          <ul className="space-y-3">
            {past.slice(0, 10).map((shift) => (
              <ShiftCard key={shift.id} shift={shift} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
