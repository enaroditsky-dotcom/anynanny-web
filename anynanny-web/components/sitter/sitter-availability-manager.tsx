"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { X, Plus, Trash2 } from "lucide-react";
import { SLOTS_PER_DAY } from "@/lib/calendar/constants";
import type { CalendarMode } from "@/lib/availability/constants";
import {
  ALL_DAY_SLOT_INDICES,
  blockEntireDaySlotIndices,
  fetchAvailabilityForDate,
  fetchSitterCalendarMode,
  normalizeSlotIndices,
  paintSetFromAvailabilityRow,
  saveAvailabilityForDate,
  unblockEntireDaySlotIndices,
  updateSitterCalendarMode
} from "@/lib/availability/sitter-availability";

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HEBREW_WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

interface TimeRange {
  start: string;
  end: string;
}

type DayVisualState = "available" | "partial" | "closed";

const FULL_DAY_RANGE: TimeRange[] = [{ start: "00:00", end: "23:59" }];

function timeToSlotIndex(hhmm: string): number {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  const idx = h * 2 + (m >= 30 ? 1 : 0);
  return Math.max(0, Math.min(SLOTS_PER_DAY, idx));
}

function endTimeToSlotIndex(hhmm: string): number {
  if (hhmm === "23:59" || hhmm === "24:00") return SLOTS_PER_DAY;
  return timeToSlotIndex(hhmm);
}

function rangesToOpenSlots(ranges: TimeRange[]): number[] {
  const open = new Set<number>();
  for (const range of ranges) {
    const start = timeToSlotIndex(range.start);
    const end = endTimeToSlotIndex(range.end);
    for (let i = start; i < end; i++) open.add(i);
  }
  return [...open].sort((a, b) => a - b);
}

function openSlotsToRanges(openSlots: number[]): TimeRange[] {
  const sorted = normalizeSlotIndices(openSlots);
  if (sorted.length === 0) return [];
  if (sorted.length === SLOTS_PER_DAY) return [...FULL_DAY_RANGE];

  const ranges: TimeRange[] = [];
  let runStart = sorted[0]!;
  let prev = sorted[0]!;

  const slotToTime = (slot: number, isEnd: boolean): string => {
    if (isEnd && slot >= SLOTS_PER_DAY) return "23:59";
    const h = Math.floor(slot / 2);
    const m = (slot % 2) * 30;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push({ start: slotToTime(runStart, false), end: slotToTime(prev + 1, true) });
    runStart = cur;
    prev = cur;
  }
  ranges.push({ start: slotToTime(runStart, false), end: slotToTime(prev + 1, true) });
  return ranges;
}

function openSlotsToDbIndices(mode: CalendarMode, openSlots: number[]): number[] {
  if (mode === "only_selected") {
    return normalizeSlotIndices(openSlots);
  }
  const open = new Set(normalizeSlotIndices(openSlots));
  return ALL_DAY_SLOT_INDICES.filter((i) => !open.has(i));
}

function isHourCovered(hour: number, ranges: TimeRange[], fullyAvailable: boolean): boolean {
  if (fullyAvailable) return true;
  return ranges.some((r) => {
    const hStart = Number(r.start.split(":")[0]);
    const endSlot = endTimeToSlotIndex(r.end);
    const hEndExclusive = Math.ceil(endSlot / 2);
    return hour >= hStart && hour < hEndExclusive;
  });
}

export function SitterAvailabilityManager() {
  const today = new Date();
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("all_except_blocked");
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  /** Open-slot counts per ISO date; missing key = unconfigured (defaults to full-day available). */
  const [dayOpenCounts, setDayOpenCounts] = useState<Record<string, number | "closed">>({});

  const [activeDateISO, setActiveDateISO] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dailyRanges, setTimeRanges] = useState<TimeRange[]>(FULL_DAY_RANGE);
  const [savingDay, setSavingDay] = useState(false);
  const [isFullyAvailable, setIsFullyAvailable] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);

  const todayISO = formatDateISO(today.getFullYear(), today.getMonth() + 1, today.getDate());

  useEffect(() => {
    void (async () => {
      try {
        const auth = await resolveBrowserAuth();
        if (!auth.ok) {
          setMessage("יש להתחבר כדי לנהל זמינות.");
          return;
        }
        setSitterId(auth.userId);

        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;

        // Unconfigured days should appear in search as available — prefer open-by-default mode.
        const modeResult = await fetchSitterCalendarMode(supabase, auth.userId);
        let mode = modeResult.mode;
        if (mode !== "all_except_blocked") {
          const updated = await updateSitterCalendarMode(supabase, auth.userId, "all_except_blocked");
          if (!updated.error) mode = "all_except_blocked";
        }
        setCalendarMode(mode);
      } catch (err) {
        console.warn("[sitter_availability] init failed:", err);
        setMessage("שגיאה בטעינת המערכת.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reloadMonth = useCallback(async () => {
    if (!sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("sitter_availability")
      .select("availability_date, slot_indices")
      .eq("sitter_id", sitterId)
      .gte("availability_date", start)
      .lte("availability_date", end);

    if (error) {
      console.warn("[sitter_availability] month summary:", error.message);
      return;
    }

    const next: Record<string, number | "closed"> = {};
    for (const row of data ?? []) {
      const iso = String(row.availability_date).slice(0, 10);
      const indices = normalizeSlotIndices(row.slot_indices);
      const paint = paintSetFromAvailabilityRow(calendarMode, iso, {
        sitter_id: sitterId,
        availability_date: iso,
        slot_indices: indices,
        updated_at: new Date().toISOString()
      });

      // Intent from configuration (ignore "all past" edge for display).
      if (paint.size === 0) {
        next[iso] = "closed";
      } else if (paint.size >= SLOTS_PER_DAY) {
        // Fully open — omit so UI uses default "available" styling
      } else {
        next[iso] = paint.size;
      }
    }
    setDayOpenCounts(next);
  }, [sitterId, year, month, calendarMode]);

  useEffect(() => {
    if (!sitterId || loading) return;
    void reloadMonth();
  }, [sitterId, loading, reloadMonth]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const monthLabel = useMemo(() => {
    return new Date(year, month - 1, 1).toLocaleString("he-IL", { month: "long", year: "numeric" });
  }, [year, month]);

  const calendarCells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const cells: ({ kind: "empty" } | { kind: "day"; day: number })[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ kind: "empty" });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ kind: "day", day: d });

    if (viewMode === "week") {
      const viewingCurrentMonth =
        year === today.getFullYear() && month === today.getMonth() + 1;
      const todayCellIdx = viewingCurrentMonth
        ? cells.findIndex((c) => c.kind === "day" && c.day === today.getDate())
        : -1;
      const sliceStart =
        todayCellIdx >= 0 ? Math.max(0, todayCellIdx - today.getDay()) : 0;
      return cells.slice(sliceStart, sliceStart + 7);
    }

    while (cells.length % 7 !== 0) cells.push({ kind: "empty" });
    return cells;
  }, [year, month, viewMode, today]);

  const dayVisualState = (iso: string): DayVisualState => {
    const value = dayOpenCounts[iso];
    if (value === "closed") return "closed";
    if (value === undefined) return "available"; // unconfigured → full day
    if (value >= SLOTS_PER_DAY - 2) return "available";
    return "partial";
  };

  const handleDayClick = async (iso: string) => {
    setActiveDateISO(iso);
    setIsModalOpen(true);
    setLoadingDay(true);
    setIsFullyAvailable(true);
    setTimeRanges([...FULL_DAY_RANGE]);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !sitterId) return;

      const { row } = await fetchAvailabilityForDate(supabase, sitterId, iso);
      const paint = paintSetFromAvailabilityRow(calendarMode, iso, row);
      const openCount = paint.size;

      if (!row) {
        // Default: פנויה ליום מלא
        setIsFullyAvailable(true);
        setTimeRanges([...FULL_DAY_RANGE]);
      } else if (openCount === 0) {
        setIsFullyAvailable(false);
        setTimeRanges([]);
      } else if (openCount >= SLOTS_PER_DAY) {
        setIsFullyAvailable(true);
        setTimeRanges([...FULL_DAY_RANGE]);
      } else {
        setIsFullyAvailable(false);
        const ranges = openSlotsToRanges([...paint]);
        setTimeRanges(ranges.length > 0 ? ranges : [{ start: "08:00", end: "16:00" }]);
      }
    } catch (err) {
      console.warn("[sitter_availability] load day failed:", err);
      setIsFullyAvailable(true);
      setTimeRanges([...FULL_DAY_RANGE]);
    } finally {
      setLoadingDay(false);
    }
  };

  const toggleFullyAvailable = (checked: boolean) => {
    setIsFullyAvailable(checked);
    if (checked) {
      setTimeRanges([...FULL_DAY_RANGE]);
    } else if (dailyRanges.length === 0 || (dailyRanges.length === 1 && dailyRanges[0]?.start === "00:00" && dailyRanges[0]?.end === "23:59")) {
      setTimeRanges([{ start: "08:00", end: "16:00" }]);
    }
  };

  const markDayClosed = () => {
    setIsFullyAvailable(false);
    setTimeRanges([]);
  };

  const addTimeRange = () => {
    setTimeRanges([...dailyRanges, { start: "17:00", end: "21:00" }]);
  };

  const removeTimeRange = (index: number) => {
    setTimeRanges(dailyRanges.filter((_, i) => i !== index));
  };

  const updateTimeRange = (index: number, field: "start" | "end", value: string) => {
    const updated = [...dailyRanges];
    updated[index] = { ...updated[index]!, [field]: value };
    setTimeRanges(updated);
  };

  const handleSaveDailyAvailability = async () => {
    setSavingDay(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !sitterId || !activeDateISO) return;

      let openSlots: number[];
      if (isFullyAvailable) {
        openSlots = [...ALL_DAY_SLOT_INDICES];
      } else if (dailyRanges.length === 0) {
        openSlots = [];
      } else {
        openSlots = rangesToOpenSlots(dailyRanges);
      }

      const dbIndices =
        openSlots.length === 0
          ? blockEntireDaySlotIndices(calendarMode)
          : openSlots.length === SLOTS_PER_DAY
            ? unblockEntireDaySlotIndices(calendarMode)
            : openSlotsToDbIndices(calendarMode, openSlots);

      const saved = await saveAvailabilityForDate(supabase, sitterId, activeDateISO, dbIndices);
      if (saved.error) {
        setMessage(saved.error);
        return;
      }

      setDayOpenCounts((prev) => {
        const next = { ...prev };
        if (openSlots.length === 0) next[activeDateISO] = "closed";
        else if (openSlots.length >= SLOTS_PER_DAY && calendarMode === "all_except_blocked") {
          delete next[activeDateISO];
        } else {
          next[activeDateISO] = openSlots.length;
        }
        return next;
      });

      setMessage(null);
      setIsModalOpen(false);
      void reloadMonth();
    } catch (err) {
      console.warn("[sitter_availability] save failed:", err);
      setMessage("שמירת הזמינות נכשלה. נסו שוב.");
    } finally {
      setSavingDay(false);
    }
  };

  if (loading) {
    return <p className="text-right text-sm text-slate-600">טוען…</p>;
  }

  return (
    <section className="mx-1 space-y-4 rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft sm:p-5" dir="rtl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#001F3F]">רזולוציית יומן:</span>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as "month" | "week")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-sm outline-none focus:border-[#001F3F]"
          >
            <option value="month">תצוגת חודש</option>
            <option value="week">תצוגת שבוע</option>
          </select>
        </div>

        <div className="flex items-center gap-2 font-semibold">
          <button type="button" className="rounded-lg border px-2 py-0.5 text-xs hover:bg-slate-50" onClick={() => shiftMonth(-1)}>
            ←
          </button>
          <span className="text-sm text-[#001F3F]">{monthLabel}</span>
          <button type="button" className="rounded-lg border px-2 py-0.5 text-xs hover:bg-slate-50" onClick={() => shiftMonth(1)}>
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
        {HEBREW_WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {calendarCells.map((cell, idx) => {
          if (cell.kind === "empty") {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }

          const iso = formatDateISO(year, month, cell.day);
          const isToday = iso === todayISO;
          const state = dayVisualState(iso);
          const isClosed = state === "closed";
          const isPartial = state === "partial";

          return (
            <button
              key={iso}
              type="button"
              onClick={() => void handleDayClick(iso)}
              aria-label={`${iso}${isClosed ? " — יום סגור" : isPartial ? " — שעות ספציפיות" : ""}`}
              className="flex aspect-square items-center justify-center bg-transparent transition active:scale-95"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center text-base font-extrabold tabular-nums sm:h-10 sm:w-10 sm:text-lg ${
                  isClosed
                    ? "rounded-full bg-red-500 text-white"
                    : isPartial
                      ? "rounded-full bg-yellow-400 text-slate-900"
                      : isToday
                        ? "font-black text-[#001F3F]"
                        : "text-slate-800"
                }`}
              >
                {cell.day}
              </span>
            </button>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="flex h-full max-h-[85vh] w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-[#001F3F]">עדכון שעות: {activeDateISO}</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto py-4" style={{ scrollbarWidth: "none" }}>
              {loadingDay ? (
                <p className="text-center text-xs text-slate-500">טוען זמינות ליום…</p>
              ) : (
                <>
                  <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <span className="text-xs font-bold text-[#001F3F]">פנויה ליום מלא (00:00–23:59)</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isFullyAvailable}
                        onChange={(e) => toggleFullyAvailable(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300" />
                      <div className="absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
                    </div>
                  </label>

                  {!isFullyAvailable ? (
                    <button
                      type="button"
                      onClick={markDayClosed}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-xs font-bold transition ${
                        dailyRanges.length === 0
                          ? "border-red-600 bg-red-500 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      יום סגור
                    </button>
                  ) : null}

                  <div className="space-y-3">
                    {dailyRanges.map((range, index) => (
                      <div
                        key={index}
                        className="flex animate-in slide-in-from-bottom-2 items-center gap-2 rounded-2xl border border-slate-100 bg-[#FDFBF6]/60 p-3 duration-200"
                      >
                        <div className="flex flex-1 items-center gap-2 text-xs font-medium text-slate-700">
                          <span>משעה:</span>
                          <input
                            type="time"
                            value={range.start}
                            disabled={isFullyAvailable}
                            onChange={(e) => updateTimeRange(index, "start", e.target.value)}
                            className="rounded-lg border border-slate-200 p-1.5 font-mono outline-none focus:border-[#001F3F] disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <span className="mr-1">עד שעה:</span>
                          <input
                            type="time"
                            value={range.end}
                            disabled={isFullyAvailable}
                            onChange={(e) => updateTimeRange(index, "end", e.target.value)}
                            className="rounded-lg border border-slate-200 p-1.5 font-mono outline-none focus:border-[#001F3F] disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                        {dailyRanges.length > 1 && !isFullyAvailable ? (
                          <button
                            type="button"
                            onClick={() => removeTimeRange(index)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ))}

                    {!isFullyAvailable && dailyRanges.length > 0 ? (
                      <button
                        type="button"
                        onClick={addTimeRange}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 active:scale-98"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>הוספת עוד שעות אפשריות ביום זה</span>
                      </button>
                    ) : null}

                    {!isFullyAvailable && dailyRanges.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => setTimeRanges([{ start: "08:00", end: "16:00" }])}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>הוספת טווח שעות</span>
                      </button>
                    ) : null}
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="max-h-48 divide-y divide-slate-50 overflow-y-auto rounded-xl border border-slate-100 text-right">
                      {Array.from({ length: 24 }).map((_, hour) => {
                        const hourLabel = `${String(hour).padStart(2, "0")}:00`;
                        const covered = isHourCovered(hour, dailyRanges, isFullyAvailable);

                        return (
                          <div
                            key={hour}
                            className={`flex items-center justify-between px-4 py-2 font-mono text-xs transition ${
                              covered
                                ? "bg-emerald-50/50 font-bold text-emerald-800"
                                : "bg-gray-700/5 text-slate-400"
                            }`}
                          >
                            <span>{hourLabel}</span>
                            <span className="font-sans text-[10px] font-semibold">
                              {covered ? "פנויה" : "סגור"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={savingDay || loadingDay}
                onClick={() => void handleSaveDailyAvailability()}
                className="rounded-xl bg-[#001F3F] px-5 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
              >
                {savingDay ? "שומר..." : "שמירת יום"}
              </button>
            </div>
          </div>
        </div>
      )}

      {message ? (
        <p
          className="animate-in fade-in rounded-xl border border-slate-100 bg-[#FDFBF6] px-3 py-2.5 text-right text-xs text-slate-700 duration-200"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
