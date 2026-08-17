"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarSlotView } from "@/lib/calendar/types";

type MonthSummary = Record<string, { available: number; busy: number }>;

type Props = {
  sitterId: string;
  mode: "sitter" | "parent";
  parentName?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function slotClasses(slot: CalendarSlotView, mode: "sitter" | "parent"): string {
  const base = "relative flex min-h-[22px] items-center border-b border-slate-100 px-2 text-xs transition-colors select-none";

  switch (slot.state) {
    case "past":
      return `${base} cursor-not-allowed bg-slate-100 text-slate-400`;
    case "busy":
      return `${base} cursor-default bg-red-50 text-red-900 ring-1 ring-inset ring-red-200`;
    case "available":
      return `${base} bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200 ${
        mode === "parent" ? "cursor-pointer hover:bg-emerald-100" : "cursor-crosshair"
      }`;
    default:
      return `${base} bg-white text-slate-600 ${mode === "sitter" ? "cursor-crosshair hover:bg-slate-50" : "cursor-default"}`;
  }
}

export function AvailabilityCalendar({ sitterId, mode, parentName = "Parent" }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthSummary, setMonthSummary] = useState<MonthSummary>({});
  const [slots, setSlots] = useState<CalendarSlotView[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [brush, setBrush] = useState<"fill" | "erase">("fill");
  const [localAvail, setLocalAvail] = useState<Set<number>>(new Set());
  const dragging = useRef(false);

  const loadMonth = useCallback(async () => {
    const response = await fetch(`/api/calendar/month?sitterId=${encodeURIComponent(sitterId)}&year=${year}&month=${month}`);
    const data = (await response.json()) as { days?: MonthSummary };
    setMonthSummary(data.days ?? {});
  }, [sitterId, year, month]);

  const loadDay = useCallback(async () => {
    if (!selectedDate) return;
    setLoadingDay(true);
    setMessage("");
    const response = await fetch(
      `/api/calendar/day?sitterId=${encodeURIComponent(sitterId)}&date=${encodeURIComponent(selectedDate)}`
    );
    const data = (await response.json()) as { slots?: CalendarSlotView[] };
    const nextSlots = data.slots ?? [];
    setSlots(nextSlots);

    if (mode === "sitter") {
      const avail = new Set<number>();
      nextSlots.forEach((s) => {
        if (s.state === "available") avail.add(s.index);
      });
      setLocalAvail(avail);
    }
    setLoadingDay(false);
  }, [sitterId, selectedDate, mode]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const monthLabel = useMemo(() => {
    return new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [year, month]);

  const calendarCells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: ({ kind: "empty" } | { kind: "day"; day: number })[] = [];

    for (let i = 0; i < startWeekday; i++) cells.push({ kind: "empty" });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ kind: "day", day: d });

    while (cells.length % 7 !== 0) cells.push({ kind: "empty" });
    return cells;
  }, [year, month]);

  /** Server slots + sitter local paint; parents always see server state only. */
  const displaySlots = useMemo(() => {
    if (mode === "parent") return slots;
    return slots.map((s) => {
      if (s.state === "busy" || s.state === "past") return s;
      if (localAvail.has(s.index)) return { ...s, state: "available" as const };
      return { ...s, state: "empty" as const };
    });
  }, [slots, localAvail, mode]);

  const applyBrushToSlot = useCallback(
    (slotIndex: number) => {
      const slot = slots[slotIndex];
      if (!slot || slot.state === "past" || slot.state === "busy") return;

      setLocalAvail((prev) => {
        const next = new Set(prev);
        if (brush === "fill") next.add(slotIndex);
        else next.delete(slotIndex);
        return next;
      });
    },
    [slots, brush]
  );

  const handleSlotPointerDown = (slotIndex: number) => {
    if (mode !== "sitter") return;
    dragging.current = true;
    applyBrushToSlot(slotIndex);
  };

  const handleSlotPointerEnter = (slotIndex: number) => {
    if (mode !== "sitter" || !dragging.current) return;
    applyBrushToSlot(slotIndex);
  };

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stop);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  const saveAvailability = async () => {
    if (!selectedDate || mode !== "sitter") return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/calendar/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sitterId,
        date: selectedDate,
        availableSlots: [...localAvail].sort((a, b) => a - b)
      })
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("Could not save availability.");
      return;
    }
    setMessage("Availability saved.");
    await loadMonth();
    await loadDay();
  };

  const bookSlot = async (slotIndex: number) => {
    if (!selectedDate || mode !== "parent") return;
    const slot = slots[slotIndex];
    if (!slot || slot.state !== "available") return;

    const ok = window.confirm(`Book ${slot.label} on ${selectedDate}?`);
    if (!ok) return;

    const response = await fetch("/api/calendar/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sitterId,
        date: selectedDate,
        slotIndex,
        parentName
      })
    });

    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Booking failed.");
      return;
    }
    setMessage("Booking confirmed. Slot is now busy.");
    loadDay();
    loadMonth();
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedDate(null);
  };

  const selectDay = (day: number) => {
    const iso = formatDateISO(year, month, day);
    const cellDate = new Date(year, month - 1, day);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    setSelectedDate(iso);
    if (cellDate < todayStart) {
      setMessage("Past day: slots are read-only (gray). Choose today or later to book or edit availability.");
    } else {
      setMessage("");
    }
  };

  const legend = (
    <div className="mb-4 flex flex-wrap gap-4 text-xs text-navy-800">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Available
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded bg-red-50 ring-1 ring-red-300" /> Booked
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-300" /> Past
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded bg-white ring-1 ring-slate-200" /> Unavailable
      </span>
    </div>
  );

  return (
    <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-sm">
      {legend}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-navy-200 px-3 py-1 text-sm font-medium text-navy-900"
            onClick={() => shiftMonth(-1)}
          >
            ←
          </button>
          <h2 className="text-lg font-semibold text-navy-900">{monthLabel}</h2>
          <button
            type="button"
            className="rounded-lg border border-navy-200 px-3 py-1 text-sm font-medium text-navy-900"
            onClick={() => shiftMonth(1)}
          >
            →
          </button>
        </div>

        {selectedDate ? (
          <button
            type="button"
            className="text-sm font-medium text-navy-700 underline"
            onClick={() => setSelectedDate(null)}
          >
            Back to month only
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-navy-700">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {calendarCells.map((cell, idx) => {
          if (cell.kind === "empty") {
            return <div key={`e-${idx}`} className="aspect-square rounded-lg bg-slate-50" />;
          }

          const iso = formatDateISO(year, month, cell.day);
          const summary = monthSummary[iso];
          const isSelected = selectedDate === iso;
          const isToday =
            today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === cell.day;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => selectDay(cell.day)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-sm font-medium transition ${
                isSelected ? "border-navy-800 bg-navy-50 text-navy-900" : "border-slate-200 bg-white text-navy-800 hover:bg-slate-50"
              }`}
            >
              <span className={isToday ? "font-bold text-navy-900" : ""}>{cell.day}</span>
              {summary ? (
                <span className="mt-1 flex gap-1 text-[12px] font-normal">
                  {summary.available > 0 ? <span className="rounded bg-emerald-100 px-1 text-emerald-800">{summary.available}</span> : null}
                  {summary.busy > 0 ? <span className="rounded bg-red-100 px-1 text-red-800">{summary.busy}</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-navy-900">Daily view</h3>
              <p className="text-sm text-navy-700">{selectedDate} · 30-minute slots</p>
            </div>

            {mode === "sitter" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-navy-700">Brush:</span>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${brush === "fill" ? "bg-emerald-700 text-white" : "bg-slate-100 text-navy-800"}`}
                  onClick={() => setBrush("fill")}
                >
                  Paint available
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${brush === "erase" ? "bg-slate-800 text-white" : "bg-slate-100 text-navy-800"}`}
                  onClick={() => setBrush("erase")}
                >
                  Erase
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="rounded-lg bg-navy-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={saveAvailability}
                >
                  {saving ? "Saving…" : "Save day"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-navy-700">Tap a green slot to request a booking.</p>
            )}
          </div>

          {loadingDay ? (
            <p className="mt-4 text-sm text-navy-700">Loading schedule…</p>
          ) : (
            <div className="mt-4 max-h-[480px] overflow-y-auto rounded-xl border border-slate-200">
              <div className="divide-y divide-slate-100">
                {displaySlots.map((slot) => (
                  <div
                    key={slot.index}
                    role={mode === "parent" && slot.state === "available" ? "button" : undefined}
                    tabIndex={mode === "parent" && slot.state === "available" ? 0 : undefined}
                    className={slotClasses(slot, mode)}
                    onPointerDown={() => handleSlotPointerDown(slot.index)}
                    onPointerEnter={() => handleSlotPointerEnter(slot.index)}
                    onClick={() => mode === "parent" && slot.state === "available" && bookSlot(slot.index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        mode === "parent" && slot.state === "available" && bookSlot(slot.index);
                      }
                    }}
                  >
                    <span className="w-14 shrink-0 font-mono text-[13px] text-slate-500">{slot.label}</span>
                    <span className="flex-1 font-medium capitalize">{slot.state}</span>
                    {slot.state === "busy" ? (
                      <span className="text-[13px] text-red-700">Booked</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-navy-700">Select a day to open the 24-hour grid {mode === "sitter" ? "and paint availability" : "and book a slot"}.</p>
      )}

      {message ? <p className="mt-4 text-sm font-medium text-navy-800">{message}</p> : null}
    </div>
  );
}
