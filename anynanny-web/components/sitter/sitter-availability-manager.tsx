"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SLOTS_PER_DAY } from "@/lib/calendar/constants";
import { isSlotPast, slotIndexToLabel } from "@/lib/calendar/slot-utils";
import type { CalendarMode } from "@/lib/availability/constants";
import {
  countOpenSlotsFromPaint,
  fetchAvailabilityForDate,
  fetchAvailabilityMonthSummary,
  fetchSitterCalendarMode,
  isDateFullyBlocked,
  paintSetFromAvailabilityRow,
  paintSetToSlotIndices,
  saveAvailabilityForDate,
  updateSitterCalendarMode
} from "@/lib/availability/sitter-availability";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HEBREW_WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function SitterAvailabilityManager() {
  const today = new Date();
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("only_selected");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthSummary, setMonthSummary] = useState<Record<string, { marked: number }>>({});
  const [localPaint, setLocalPaint] = useState<Set<number>>(new Set());
  const [brush, setBrush] = useState<"fill" | "erase">("fill");
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dragging = useRef(false);
  const draggedDuringGesture = useRef(false);
  const suppressClickRef = useRef(false);
  const paintRef = useRef<Set<number>>(new Set());
  const calendarModeRef = useRef<CalendarMode>("only_selected");

  useEffect(() => {
    paintRef.current = localPaint;
  }, [localPaint]);

  useEffect(() => {
    calendarModeRef.current = calendarMode;
  }, [calendarMode]);

  useEffect(() => {
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setMessage("יש להתחבר כדי לנהל זמינות.");
        setLoading(false);
        return;
      }
      setSitterId(auth.userId);
      const { mode } = await fetchSitterCalendarMode(auth.supabase, auth.userId);
      setCalendarMode(mode);
      calendarModeRef.current = mode;
      setLoading(false);
    })();
  }, []);

  const loadMonth = useCallback(async () => {
    if (!sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
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
    setMonthSummary(days);
  }, [sitterId, year, month]);

  const loadDay = useCallback(async () => {
    if (!sitterId || !selectedDate) return;
    setLoadingDay(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadingDay(false);
      return;
    }
    const { row, error } = await fetchAvailabilityForDate(supabase, sitterId, selectedDate);
    if (error) {
      console.warn("[sitter_availability] load day:", error);
      setMessage(error);
      setLocalPaint(new Set());
      paintRef.current = new Set();
    } else {
      const paint = paintSetFromAvailabilityRow(calendarModeRef.current, selectedDate, row);
      setLocalPaint(paint);
      paintRef.current = paint;
    }
    setLoadingDay(false);
  }, [sitterId, selectedDate]);

  useEffect(() => {
    if (!sitterId) return;
    void loadMonth();
  }, [sitterId, loadMonth, calendarMode]);

  useEffect(() => {
    if (!selectedDate) return;
    void loadDay();
  }, [selectedDate, loadDay]);

  /** Keep month tile colors in sync while editing the selected day. */
  useEffect(() => {
    if (!selectedDate) return;
    const open = countOpenSlotsFromPaint(selectedDate, localPaint);
    setMonthSummary((prev) => ({
      ...prev,
      [selectedDate]: { marked: open }
    }));
  }, [localPaint, selectedDate]);

  const persistPaint = useCallback(
    async (paint: Set<number>, options?: { silent?: boolean }) => {
      if (!sitterId || !selectedDate) return false;

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage("Supabase לא זמין");
        return false;
      }

      setSaving(true);
      if (!options?.silent) setMessage(null);

      const indices = paintSetToSlotIndices(calendarModeRef.current, paint);
      const { row, error } = await saveAvailabilityForDate(supabase, sitterId, selectedDate, indices);

      setSaving(false);

      if (error) {
        console.warn("[sitter_availability] save:", error);
        setMessage(error);
        await loadDay();
        return false;
      }

      const synced = paintSetFromAvailabilityRow(calendarModeRef.current, selectedDate, row);
      setLocalPaint(synced);
      paintRef.current = synced;

      if (!options?.silent) {
        setMessage("נשמר — השעות עודכנו.");
      }
      void loadMonth();
      return true;
    },
    [sitterId, selectedDate, loadDay, loadMonth]
  );

  const applyBrushToSlot = useCallback((slotIndex: number, mode: "fill" | "erase") => {
    if (!selectedDate || isSlotPast(selectedDate, slotIndex)) return null;

    const next = new Set(paintRef.current);
    if (mode === "fill") next.add(slotIndex);
    else next.delete(slotIndex);

    setLocalPaint(next);
    paintRef.current = next;
    return next;
  }, [selectedDate]);

  const toggleSlotAt = useCallback(
    async (slotIndex: number) => {
      if (!selectedDate || isSlotPast(selectedDate, slotIndex)) return;

      const next = new Set(paintRef.current);
      if (next.has(slotIndex)) next.delete(slotIndex);
      else next.add(slotIndex);

      setLocalPaint(next);
      paintRef.current = next;
      await persistPaint(next, { silent: true });
    },
    [selectedDate, persistPaint]
  );

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
      void persistPaint(paintRef.current, { silent: true });
    }
  }, [persistPaint]);

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
    if (!sitterId || mode === calendarMode) return;
    setModeSaving(true);
    setMessage(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setModeSaving(false);
      return;
    }
    const { error } = await updateSitterCalendarMode(supabase, sitterId, mode);
    setModeSaving(false);
    if (error) {
      console.warn("[sitter_availability] calendar_mode:", error);
      setMessage(error);
      return;
    }
    setCalendarMode(mode);
    calendarModeRef.current = mode;
    setMessage(mode === "only_selected" ? "מצב: פתוח רק בשעות שתסמנו" : "מצב: פתוח כברירת מחדל — חסמו שעות שלא פנויות");
    if (selectedDate) await loadDay();
    void loadMonth();
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedDate(null);
  };

  const handleSaveDay = async () => {
    await persistPaint(paintRef.current);
  };

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
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          const summary = monthSummary[iso];
          const isSelected = selectedDate === iso;
          const livePaint = isSelected ? localPaint : undefined;
          const openCount =
            livePaint != null ? countOpenSlotsFromPaint(iso, livePaint) : (summary?.marked ?? 0);
          const fullyBlocked = isDateFullyBlocked(iso, calendarMode, summary?.marked, { livePaint });

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
                const open = localPaint.has(index);
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
