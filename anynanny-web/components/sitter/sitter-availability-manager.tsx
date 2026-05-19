"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { SLOTS_PER_DAY } from "@/lib/calendar/constants";
import { isSlotPast, slotIndexToLabel } from "@/lib/calendar/slot-utils";
import type { CalendarMode } from "@/lib/availability/constants";
import {
  blockEntireDaySlotIndices,
  countOpenSlotsInIndices,
  deleteAvailabilityForDate,
  fetchAvailabilityForDate,
  fetchAvailabilityMonthSummary,
  fetchSitterCalendarMode,
  isDateFullyBlockedFromIndices,
  isSlotOpenInIndices,
  normalizeSlotIndices,
  saveAvailabilityForDate,
  setSlotOpenInIndices,
  toggleSlotInIndices,
  unblockEntireDaySlotIndices,
  updateSitterCalendarMode
} from "@/lib/availability/sitter-availability";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HEBREW_WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function applyIndicesState(
  indices: number[],
  setSlotIndices: (v: number[]) => void,
  indicesRef: MutableRefObject<number[]>
) {
  const safe = normalizeSlotIndices(indices);
  setSlotIndices(safe);
  indicesRef.current = safe;
}

export function SitterAvailabilityManager() {
  const today = new Date();
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("only_selected");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthSummary, setMonthSummary] = useState<Record<string, { marked: number }>>({});
  const [slotIndices, setSlotIndices] = useState<number[]>([]);
  const [brush, setBrush] = useState<"fill" | "erase">("fill");
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dragging = useRef(false);
  const draggedDuringGesture = useRef(false);
  const suppressClickRef = useRef(false);
  const slotIndicesRef = useRef<number[]>([]);
  const calendarModeRef = useRef<CalendarMode>("only_selected");

  useEffect(() => {
    slotIndicesRef.current = slotIndices;
  }, [slotIndices]);

  useEffect(() => {
    calendarModeRef.current = calendarMode;
  }, [calendarMode]);

  useEffect(() => {
    void (async () => {
      try {
        const auth = await resolveBrowserAuth();
        if (!auth.ok) {
          setMessage("יש להתחבר כדי לנהל זמינות.");
          return;
        }
        setSitterId(auth.userId);
        if (!auth.supabase) {
          setMessage("Supabase לא זמין");
          return;
        }
        const { mode } = await fetchSitterCalendarMode(auth.supabase, auth.userId);
        setCalendarMode(mode);
        calendarModeRef.current = mode;
      } catch (err) {
        console.warn("[sitter_availability] init failed:", err);
        setMessage("שגיאה בטעינת הזמינות — רעננו את הדף.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadMonth = useCallback(async () => {
    if (!sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    try {
      const { days, error } = await fetchAvailabilityMonthSummary(
        supabase,
        sitterId,
        year,
        month,
        calendarModeRef.current
      );
      if (error) {
        console.warn("[sitter_availability] month summary:", error);
        setMessage(error);
      }
      setMonthSummary(days && typeof days === "object" ? days : {});
    } catch (err) {
      console.warn("[sitter_availability] month summary failed:", err);
      setMonthSummary({});
    }
  }, [sitterId, year, month]);

  const loadDay = useCallback(async () => {
    if (!sitterId || !selectedDate) return;
    setLoadingDay(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadingDay(false);
      return;
    }
    try {
      const { row, error } = await fetchAvailabilityForDate(supabase, sitterId, selectedDate);
      if (error) {
        console.warn("[sitter_availability] load day:", error);
        setMessage(error);
        applyIndicesState([], setSlotIndices, slotIndicesRef);
      } else {
        const indices = row?.slot_indices ?? [];
        applyIndicesState(indices, setSlotIndices, slotIndicesRef);
      }
    } catch (err) {
      console.warn("[sitter_availability] load day failed:", err);
      setMessage("שגיאה בטעינת היום — נסו שוב.");
      applyIndicesState([], setSlotIndices, slotIndicesRef);
    }
    setLoadingDay(false);
  }, [sitterId, selectedDate]);

  useEffect(() => {
    if (!sitterId) return;
    void loadMonth();
  }, [sitterId, loadMonth, calendarMode]);

  /** Default to today in the visible month so day actions (e.g. נקה הכל) work without an extra tap. */
  useEffect(() => {
    if (!sitterId || selectedDate) return;
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() + 1 === month) {
      setSelectedDate(formatDateISO(year, month, now.getDate()));
    }
  }, [sitterId, year, month, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    void loadDay();
  }, [selectedDate, loadDay]);

  /** Keep month tile colors in sync while editing the selected day. */
  useEffect(() => {
    if (!selectedDate) return;
    try {
      const open = countOpenSlotsInIndices(selectedDate, calendarModeRef.current, slotIndices);
      setMonthSummary((prev) => ({
        ...(prev ?? {}),
        [selectedDate]: { marked: open }
      }));
    } catch (err) {
      console.warn("[sitter_availability] month tile sync:", err);
    }
  }, [slotIndices, selectedDate]);

  const persistSlotIndices = useCallback(
    async (indices: number[], options?: { silent?: boolean }) => {
      if (!sitterId || !selectedDate) return false;

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage("Supabase לא זמין");
        return false;
      }

      const normalized = normalizeSlotIndices(indices);
      applyIndicesState(normalized, setSlotIndices, slotIndicesRef);
      setSaving(true);
      if (!options?.silent) setMessage(null);

      try {
        const { row, error } = await saveAvailabilityForDate(supabase, sitterId, selectedDate, normalized);

        if (error) {
          console.warn("[sitter_availability] save:", error);
          setMessage(error);
          await loadDay();
          return false;
        }

        const synced = normalizeSlotIndices(row?.slot_indices ?? normalized);
        applyIndicesState(synced, setSlotIndices, slotIndicesRef);

        if (!options?.silent) {
          setMessage("נשמר — השעות עודכנו.");
        }
        void loadMonth();
        return true;
      } catch (err) {
        console.warn("[sitter_availability] save failed:", err);
        setMessage("שגיאה בשמירה — נסו שוב.");
        await loadDay();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [sitterId, selectedDate, loadDay, loadMonth]
  );

  const applyBrushToSlot = useCallback((slotIndex: number, mode: "fill" | "erase") => {
    if (!selectedDate || loadingDay || saving) return null;
    if (isSlotPast(selectedDate, slotIndex)) return null;

    const open = mode === "fill";
    const next = setSlotOpenInIndices(
      calendarModeRef.current,
      slotIndex,
      slotIndicesRef.current,
      open
    );
    applyIndicesState(next, setSlotIndices, slotIndicesRef);
    return next;
  }, [selectedDate, loadingDay, saving]);

  const toggleSlotAt = useCallback(
    async (slotIndex: number) => {
      if (!selectedDate || loadingDay || saving || isSlotPast(selectedDate, slotIndex)) return;

      const next = toggleSlotInIndices(calendarModeRef.current, slotIndex, slotIndicesRef.current);
      applyIndicesState(next, setSlotIndices, slotIndicesRef);
      await persistSlotIndices(next, { silent: true });
    },
    [selectedDate, loadingDay, saving, persistSlotIndices]
  );

  const handleBlockEntireDay = useCallback(async () => {
    if (!selectedDate || loadingDay || saving) return;
    const next = blockEntireDaySlotIndices(calendarModeRef.current);
    applyIndicesState(next, setSlotIndices, slotIndicesRef);
    await persistSlotIndices(next, { silent: true });
  }, [selectedDate, loadingDay, saving, persistSlotIndices]);

  const handleUnblockEntireDay = useCallback(async () => {
    if (!selectedDate || loadingDay || saving) return;
    const next = unblockEntireDaySlotIndices(calendarModeRef.current);
    applyIndicesState(next, setSlotIndices, slotIndicesRef);
    await persistSlotIndices(next, { silent: true });
  }, [selectedDate, loadingDay, saving, persistSlotIndices]);

  const handleClearAllForDay = useCallback(async () => {
    if (!sitterId || saving || modeSaving) return;

    let targetDate = selectedDate;
    if (!targetDate) {
      const now = new Date();
      if (now.getFullYear() === year && now.getMonth() + 1 === month) {
        targetDate = formatDateISO(year, month, now.getDate());
        setSelectedDate(targetDate);
      } else {
        setMessage("בחרו יום בלוח החודש לפני ניקוי.");
        return;
      }
    }

    if (!window.confirm("האם אתה בטוח שברצונך לנקות את כל השעות ליום זה?")) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא זמין");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await deleteAvailabilityForDate(supabase, sitterId, targetDate);
      if (error) {
        console.warn("[sitter_availability] clear day:", error);
        setMessage(error);
        return;
      }

      applyIndicesState([], setSlotIndices, slotIndicesRef);
      const openCount = countOpenSlotsInIndices(targetDate, calendarModeRef.current, []);
      setMonthSummary((prev) => ({
        ...(prev ?? {}),
        [targetDate]: { marked: openCount }
      }));
      setMessage("כל השעות ליום זה נוקו.");
      void loadMonth();
    } catch (err) {
      console.warn("[sitter_availability] clear day failed:", err);
      setMessage("שגיאה בניקוי היום — נסו שוב.");
    } finally {
      setSaving(false);
    }
  }, [selectedDate, sitterId, year, month, saving, modeSaving, loadMonth]);

  const handleSlotPointerDown = (slotIndex: number) => {
    if (!selectedDate || isSlotPast(selectedDate, slotIndex)) return;
    dragging.current = true;
    draggedDuringGesture.current = false;
  };

  const handleSlotPointerEnter = (slotIndex: number) => {
    if (!dragging.current) return;
    applyBrushToSlot(slotIndex, brush);
    draggedDuringGesture.current = true;
  };

  const flushDragPaint = useCallback(() => {
    if (!dragging.current) return;
    const wasDrag = draggedDuringGesture.current;
    dragging.current = false;
    draggedDuringGesture.current = false;
    if (wasDrag) {
      suppressClickRef.current = true;
      void persistSlotIndices(slotIndicesRef.current, { silent: true });
    }
  }, [persistSlotIndices]);

  useEffect(() => {
    const stop = () => {
      flushDragPaint();
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [flushDragPaint]);

  const monthLabel = useMemo(
    () => new Date(year, month - 1, 1).toLocaleString("he-IL", { month: "long", year: "numeric" }),
    [year, month]
  );

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

  const handleModeChange = async (mode: CalendarMode) => {
    if (!sitterId || mode === calendarMode || modeSaving) return;
    setModeSaving(true);
    setMessage(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setModeSaving(false);
      return;
    }
    try {
      const { error } = await updateSitterCalendarMode(supabase, sitterId, mode);
      if (error) {
        console.warn("[sitter_availability] calendar_mode:", error);
        setMessage(error);
        return;
      }
      setCalendarMode(mode);
      calendarModeRef.current = mode;
      setMessage(
        mode === "only_selected"
          ? "מצב: פתוח רק בשעות שתסמנו"
          : "מצב: פתוח כברירת מחדל — חסמו שעות שלא פנויות"
      );
      if (selectedDate) {
        await loadDay();
      } else {
        applyIndicesState([], setSlotIndices, slotIndicesRef);
      }
      void loadMonth();
    } catch (err) {
      console.warn("[sitter_availability] calendar_mode failed:", err);
      setMessage("שגיאה בעדכון מצב היומן — נסו שוב.");
    } finally {
      setModeSaving(false);
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedDate(null);
  };

  const handleSaveDay = async () => {
    if (!selectedDate || loadingDay) return;
    await persistSlotIndices(slotIndicesRef.current);
  };

  const safeMonthSummary = monthSummary ?? {};
  const activeIndices = normalizeSlotIndices(slotIndices);

  if (loading) {
    return <p className="text-right text-sm text-slate-600">טוען ניהול זמינות…</p>;
  }

  if (!sitterId) {
    return <p className="text-right text-sm text-rose-700">{message ?? "לא ניתן לטעון זמינות."}</p>;
  }

  const modeHint =
    calendarMode === "only_selected"
      ? "לחצו על שורת שעה כדי לסמן פנוי / לא פנוי. השינוי נשמר אוטומטית."
      : "ברירת מחדל: כל השעות פנויות. לחצו על שעה לחסום, או גררו עם מברשת החסימה.";

  const fillLabel = calendarMode === "only_selected" ? "סימון פנוי" : "ביטול חסימה";
  const eraseLabel = calendarMode === "only_selected" ? "מחיקה" : "חסימת שעה";

  return (
    <section className="mx-1 space-y-4 rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft sm:p-5">
      <div className="rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/90 p-3 text-right">
        <p className="text-sm font-bold text-[#001F3F]">מצב יומן</p>
        <p className="mt-1 text-xs text-slate-600">{modeHint}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={modeSaving}
            onClick={() => void handleModeChange("only_selected")}
            className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
              calendarMode === "only_selected"
                ? "bg-[#001F3F] text-white"
                : "border border-navy-header/15 bg-white text-navy-header hover:bg-brand-cream"
            }`}
          >
            רק שעות שבחרתי
          </button>
          <button
            type="button"
            disabled={modeSaving}
            onClick={() => void handleModeChange("all_except_blocked")}
            className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
              calendarMode === "all_except_blocked"
                ? "bg-[#001F3F] text-white"
                : "border border-navy-header/15 bg-white text-navy-header hover:bg-brand-cream"
            }`}
          >
            פתוח — חסום חריגים
          </button>
          </div>
          <button
            type="button"
            disabled={modeSaving || saving}
            title="נקה את כל השעות ליום הנבחר בלוח"
            onClick={() => void handleClearAllForDay()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-rose-700 transition hover:border-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[6.5rem] sm:shrink-0"
          >
            {saving ? "מנקה…" : "נקה הכל"}
          </button>
        </div>
      </div>

      <p className="text-right text-xs text-slate-500">
        נשמר ב־<span className="font-mono">sitter_availability</span> לפי יום ומערך שעות (חצי שעה). אין כאן משמרות
        מאושרות.
      </p>

      <div className="flex flex-row-reverse items-center justify-between gap-2 border-b border-navy-header/10 pb-3">
        <button type="button" className="rounded-lg border px-2 py-1 text-sm" onClick={() => shiftMonth(-1)}>
          ←
        </button>
        <span className="text-base font-bold text-[#001F3F]">{monthLabel}</span>
        <button type="button" className="rounded-lg border px-2 py-1 text-sm" onClick={() => shiftMonth(1)}>
          →
        </button>
      </div>

      <div className="mb-2 flex flex-wrap flex-row-reverse justify-end gap-3 text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded border border-emerald-300 bg-emerald-50" aria-hidden />
          יום עם שעות פנויות
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded border border-red-300 bg-red-50" aria-hidden />
          יום חסום לחלוטין
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-600">
        {HEBREW_WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarCells.map((cell, idx) => {
          if (cell.kind === "empty") {
            return <div key={`e-${idx}`} className="aspect-square rounded-lg bg-slate-50/80" />;
          }
          const iso = formatDateISO(year, month, cell.day);
          const summary = safeMonthSummary[iso];
          const isSelected = selectedDate === iso;
          const liveIndices = isSelected ? activeIndices : undefined;
          const openCount =
            liveIndices != null
              ? countOpenSlotsInIndices(iso, calendarMode, liveIndices)
              : (summary?.marked ?? 0);
          const fullyBlocked = isDateFullyBlockedFromIndices(iso, calendarMode, summary?.marked, {
            liveIndices
          });

          let tileClass =
            "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition ";
          if (isSelected) {
            tileClass += fullyBlocked
              ? "border-red-400 bg-red-100 font-bold text-red-700 ring-2 ring-[#001F3F]/30"
              : "border-[#001F3F] bg-[#001F3F]/10 font-bold text-[#001F3F]";
          } else if (fullyBlocked) {
            tileClass += "border-red-200 bg-red-50 text-red-600 hover:bg-red-100";
          } else {
            tileClass += "border-slate-200 bg-white text-navy-900 hover:bg-brand-cream/50";
          }

          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                setSelectedDate(iso);
                setMessage(null);
              }}
              className={tileClass}
            >
              {cell.day}
              {fullyBlocked ? (
                <span className="mt-0.5 rounded border border-red-300 bg-red-100 px-1 text-[8px] font-semibold text-red-700">
                  סגור
                </span>
              ) : openCount > 0 ? (
                <span className="mt-0.5 rounded border border-emerald-200 bg-emerald-100 px-1 text-[9px] font-medium text-emerald-800">
                  {openCount} פנוי
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <div className="border-t border-navy-header/10 pt-4">
          <div className="flex flex-wrap flex-row-reverse items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#001F3F]">{selectedDate}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBrush("fill")}
                className={`rounded-lg px-2 py-1 text-xs font-semibold ${brush === "fill" ? "bg-emerald-700 text-white" : "bg-slate-100"}`}
                aria-pressed={brush === "fill"}
              >
                {fillLabel}
              </button>
              <button
                type="button"
                onClick={() => setBrush("erase")}
                className={`rounded-lg px-2 py-1 text-xs font-semibold ${brush === "erase" ? "bg-slate-800 text-white" : "bg-slate-100"}`}
                aria-pressed={brush === "erase"}
              >
                {eraseLabel}
              </button>
              <button
                type="button"
                disabled={saving || loadingDay}
                onClick={() => void handleBlockEntireDay()}
                className="rounded-lg border border-red-300 bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50"
              >
                חסימת יום
              </button>
              <button
                type="button"
                disabled={saving || loadingDay}
                onClick={() => void handleUnblockEntireDay()}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-50"
              >
                ביטול חסימה
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveDay()}
                className="rounded-lg bg-[#001F3F] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {saving ? "שומרים…" : "שמירת יום"}
              </button>
            </div>
          </div>

          <p className="mt-2 text-right text-[11px] text-slate-500">
            מברשת פעילה: <span className="font-semibold">{brush === "fill" ? fillLabel : eraseLabel}</span> — לחיצה על
            שעה מחליפה פנוי/לא פנוי ושומרת מיד.
          </p>

          {loadingDay ? (
            <p className="mt-3 text-sm text-slate-500">טוען יום…</p>
          ) : (
            <div
              className="mt-3 max-h-72 touch-none overflow-y-auto rounded-xl border border-navy-header/10"
              onPointerLeave={flushDragPaint}
            >
              {Array.from({ length: SLOTS_PER_DAY }, (_, index) => {
                const past = isSlotPast(selectedDate, index);
                const open = isSlotOpenInIndices(calendarMode, index, activeIndices);
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={past || saving}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      void toggleSlotAt(index);
                    }}
                    onPointerDown={() => handleSlotPointerDown(index)}
                    onPointerEnter={() => handleSlotPointerEnter(index)}
                    className={`flex w-full flex-row-reverse items-center gap-2 border-b px-3 py-1.5 text-xs select-none ${
                      past
                        ? "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400"
                        : open
                          ? "cursor-pointer border-emerald-200/80 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                          : "cursor-pointer border-red-300 bg-red-100 text-red-700 hover:bg-red-200/80"
                    }`}
                  >
                    <span className="font-mono tabular-nums">{slotIndexToLabel(index)}</span>
                    <span className="flex flex-1 flex-row-reverse items-center justify-end gap-2 text-right">
                      {past ? (
                        <span>עבר</span>
                      ) : open ? (
                        <>
                          <span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            פנוי
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                            לא פנוי
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="text-right text-sm text-slate-600">בחרו יום בחודש כדי לערוך שעות.</p>
      )}

      {message ? (
        <p
          className="rounded-xl border border-navy-header/10 bg-[#FDFBF6] px-3 py-2 text-right text-xs text-slate-700"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
