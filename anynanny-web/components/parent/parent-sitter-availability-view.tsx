"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDayNumber } from "@/components/calendar/calendar-day-number";
import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import {
  parentAvailabilityStateLabel,
  sanitizeParentAvailabilityDays,
  type ParentAvailabilityDay,
  type ParentAvailabilityState
} from "@/lib/favorites/parent-sitter-availability";

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function stateFill(state: ParentAvailabilityState | undefined): "none" | "closed" | "partial" {
  if (state === "unavailable") return "closed";
  if (state === "occupied") return "partial";
  return "none";
}

export function ParentSitterAvailabilityView({ sitterId }: { sitterId: string }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [days, setDays] = useState<ParentAvailabilityDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayDateISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/parent/sitter/${encodeURIComponent(sitterId)}/availability?year=${year}&month=${month}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const json = (await response.json().catch(() => ({}))) as {
        days?: ParentAvailabilityDay[];
        error?: string;
      };
      if (!response.ok) {
        setDays([]);
        setError(json.error || "לא ניתן לטעון את הזמינות.");
        return;
      }
      setDays(sanitizeParentAvailabilityDays(Array.isArray(json.days) ? json.days : []));
    } catch {
      setDays([]);
      setError("לא ניתן לטעון את הזמינות.");
    } finally {
      setLoading(false);
    }
  }, [month, sitterId, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const selected = selectedDate ? byDate.get(selectedDate) : undefined;

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells: Array<string | null> = [...Array.from({ length: firstWeekday }, () => null)];
  for (const day of days) cells.push(day.date);

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  return (
    <section className="rounded-2xl border border-navy-header/10 bg-white p-3 shadow-soft" dir="rtl">
      <div className="mb-3 text-right">
        <h1 className="text-lg font-bold text-[#001F3F]">זמינות לבייביסיטר</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          מוצגת רק זמינות שהבייביסיטרית פתחה ב-AnyNanny. ימים תפוסים מסומנים בלי פרטים על משפחות אחרות.
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => shiftMonth(1)} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[#001F3F]">
          הבא
        </button>
        <p className="text-sm font-bold text-[#001F3F]">
          {month}/{year}
        </p>
        <button type="button" onClick={() => shiftMonth(-1)} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[#001F3F]">
          הקודם
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">טוען זמינות…</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">
        {WEEKDAYS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso, index) => {
          if (!iso) return <span key={`empty-${index}`} />;
          const state = byDate.get(iso)?.state;
          const dayNumber = Number(iso.slice(8, 10));
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelectedDate(iso)}
              className={`flex min-h-11 items-center justify-center rounded-xl ${
                state === "available" ? "bg-emerald-50" : ""
              }`}
              aria-label={`${pad2(dayNumber)} ${parentAvailabilityStateLabel(state ?? "unavailable")}`}
            >
              <CalendarDayNumber iso={iso} selectedIso={selectedDate} statusFill={stateFill(state)}>
                {dayNumber}
              </CalendarDayNumber>
            </button>
          );
        })}
      </div>

      <ul className="mt-3 space-y-1 text-right text-xs text-slate-600">
        <li>פנויה — אפשר לתאם משמרת</li>
        <li>לא פנויה — אין זמינות פתוחה</li>
        <li>תפוסה — הזמן תפוס דרך AnyNanny</li>
      </ul>

      {selected ? (
        <p className="mt-3 rounded-xl bg-[#FDFBF6] px-3 py-2 text-right text-sm font-bold text-[#001F3F]">
          {selected.date}: {parentAvailabilityStateLabel(selected.state)}
        </p>
      ) : null}
    </section>
  );
}
