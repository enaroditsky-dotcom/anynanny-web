"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Square } from "lucide-react";
import { isBookingDateToday } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import {
  fetchConfirmedShiftsForSitter,
  type ConfirmedShiftView
} from "@/lib/bookings/sitter-confirmed-shifts";
import { sitterStartShift } from "@/lib/bookings/sitter-start-shift";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

function ShiftCard({
  shift,
  startingId,
  onStartShift
}: {
  shift: ConfirmedShiftView;
  startingId: string | null;
  onStartShift: (shiftId: string) => void;
}) {
  const isPast = new Date(shift.end_time).getTime() < Date.now();
  const isToday = isBookingDateToday(shift.booking_date);
  const isApproved = shift.status === "approved";
  const isSitterStarted = shift.status === "sitter_started";
  const showArrivalButton = isToday && isApproved && !isPast;
  const isStarting = startingId === shift.id;

  return (
    <li
      className={`rounded-2xl border p-4 text-right shadow-sm ${
        isPast ? "border-slate-200 bg-slate-50/80 opacity-80" : "border-navy-header/12 bg-white"
      }`}
    >
      <div className="flex flex-row-reverse items-start justify-between gap-2">
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isSitterStarted
              ? "bg-amber-100 text-amber-900"
              : isPast
                ? "bg-slate-200 text-slate-700"
                : "bg-emerald-100 text-emerald-900"
          }`}
        >
          {isSitterStarted ? "ממתין לאישור הורה" : isPast ? "הסתיימה" : "קרובה"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#001F3F]">{shift.parent_full_name ?? "הורה"}</p>
          <p className="mt-1 text-xs font-medium text-slate-600 tabular-nums">{shift.schedule_label}</p>
        </div>
        <CalendarClock className="h-5 w-5 shrink-0 text-[#001F3F]/70" aria-hidden />
      </div>

      {showArrivalButton ? (
        <button
          type="button"
          disabled={isStarting}
          onClick={() => onStartShift(shift.id)}
          className="mt-4 inline-flex w-full flex-row-reverse items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-70"
        >
          {isStarting ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          )}
          הגעתי! התחלת משמרת
        </button>
      ) : null}

      {isToday && isSitterStarted && !isPast ? (
        <div
          className="mt-4 flex flex-row-reverse items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin text-amber-700" aria-hidden />
          ממתין לאישור הורה...
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!showArrivalButton && !isSitterStarted ? (
          <button
            type="button"
            disabled
            title="זמין במשמרות מאושרות להיום"
            className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl border border-[#001F3F]/20 bg-[#FDFBF6] px-3 py-2.5 text-xs font-semibold text-[#001F3F] opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            התחלת משמרת
          </button>
        ) : null}
        <button
          type="button"
          disabled
          title="אימות סיום משמרת — יופעל בקרוב"
          className={`inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 opacity-60 ${
            showArrivalButton || isSitterStarted ? "sm:col-span-2" : ""
          }`}
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
};

export function SitterConfirmedShifts({ sitterId: sitterIdProp = null, refreshNonce = 0 }: SitterConfirmedShiftsProps) {
  const [sitterId, setSitterId] = useState<string | null>(sitterIdProp);
  const [shifts, setShifts] = useState<ConfirmedShiftView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
  }, [load]);

  const effectiveSitterId = sitterIdProp ?? sitterId;

  useEffect(() => {
    if (!effectiveSitterId) return;
    setLoading(true);
    void load(effectiveSitterId);
  }, [effectiveSitterId, load, refreshNonce]);

  useEffect(() => {
    if (!effectiveSitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`sitter-confirmed-bookings-${effectiveSitterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${effectiveSitterId}`
        },
        () => {
          void load(effectiveSitterId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveSitterId, load]);

  const handleStartShift = useCallback(
    async (bookingId: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setActionError("Supabase לא זמין");
        return;
      }

      const previous = shifts;
      const startedAt = new Date().toISOString();

      setActionError(null);
      setStartingId(bookingId);
      setShifts((current) =>
        current.map((s) =>
          s.id === bookingId ? { ...s, status: "sitter_started", actual_start_time: startedAt } : s
        )
      );

      const { row, error: startError } = await sitterStartShift(supabase, bookingId);
      setStartingId(null);

      if (startError || !row) {
        setShifts(previous);
        setActionError(startError ?? "התחלת המשמרת נכשלה.");
        return;
      }

      setShifts((current) =>
        current.map((s) =>
          s.id === bookingId
            ? {
                ...s,
                status: row.status,
                actual_start_time: row.actual_start_time ?? startedAt
              }
            : s
        )
      );
    },
    [shifts]
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

      {actionError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {actionError}
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
                startingId={startingId}
                onStartShift={(id) => void handleStartShift(id)}
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
              <ShiftCard
                key={shift.id}
                shift={shift}
                startingId={startingId}
                onStartShift={(id) => void handleStartShift(id)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
