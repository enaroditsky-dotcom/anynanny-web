"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Square } from "lucide-react";
import { isBookingDateToday } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import {
  fetchConfirmedShiftsForSitter,
  type ConfirmedShiftView
} from "@/lib/bookings/sitter-confirmed-shifts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

function ShiftCard({ shift }: { shift: ConfirmedShiftView }) {
  const isPast = new Date(shift.end_time).getTime() < Date.now();
  const isToday = isBookingDateToday(shift.booking_date);
  const isSitterStarted = shift.status === "sitter_started";

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
};

export function SitterConfirmedShifts({ sitterId: sitterIdProp = null, refreshNonce = 0 }: SitterConfirmedShiftsProps) {
  const [sitterId, setSitterId] = useState<string | null>(sitterIdProp);
  const [shifts, setShifts] = useState<ConfirmedShiftView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
              <ShiftCard key={shift.id} shift={shift} />
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
