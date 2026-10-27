"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { parentSearchLocalCalendarDate } from "@/lib/sitter/parent-search-datetime";
import {
  formatParentSearchDateLabel,
  parentSearchCalendarMonthLabel,
  parentSearchCalendarMonthOf,
  parentSearchCalendarWeeks,
  parentSearchWeekdayLabels,
  type ParentSearchCalendarDay
} from "@/lib/sitter/parent-search-calendar";

const WEEKDAYS = parentSearchWeekdayLabels();

function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const next = new Date(year, monthIndex + delta, 1);
  return { year: next.getFullYear(), monthIndex: next.getMonth() };
}

function focusableDay(days: ParentSearchCalendarDay[], preferred: string[]): string | null {
  for (const iso of preferred) {
    if (days.some((day) => day.iso === iso && day.selectable)) return iso;
  }
  return days.find((day) => day.selectable)?.iso ?? null;
}

export function ParentSearchDateField({
  value,
  min,
  now,
  disabled = false,
  invalid = false,
  align = "start",
  className,
  onChange
}: {
  value: string;
  min: string;
  now: Date;
  disabled?: boolean;
  invalid?: boolean;
  /** Which edge of the narrow field the white panel anchors to. */
  align?: "start" | "end";
  className: string;
  onChange: (next: string) => void;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    return parentSearchCalendarMonthOf(value || min) ?? {
      year: now.getFullYear(),
      monthIndex: now.getMonth()
    };
  });
  const [focusIso, setFocusIso] = useState<string | null>(null);

  const todayIso = parentSearchLocalCalendarDate(now);
  const weeks = parentSearchCalendarWeeks(cursor.year, cursor.monthIndex, min);
  const flatDays = weeks.flat();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !focusIso) return;
    dayRefs.current.get(focusIso)?.focus();
  }, [open, focusIso, cursor]);

  const openPanel = () => {
    if (disabled) return;
    const month = parentSearchCalendarMonthOf(value || min || todayIso);
    if (month) setCursor(month);
    const days = parentSearchCalendarWeeks(
      month?.year ?? now.getFullYear(),
      month?.monthIndex ?? now.getMonth(),
      min
    ).flat();
    setFocusIso(focusableDay(days, [value, todayIso, min]));
    setOpen(true);
  };

  const choose = (iso: string) => {
    if (!flatDays.some((day) => day.iso === iso && day.selectable)) return;
    onChange(iso);
    setOpen(false);
  };

  const moveFocus = (delta: number) => {
    if (!focusIso) return;
    const index = flatDays.findIndex((day) => day.iso === focusIso);
    if (index < 0) return;
    const direction = Math.sign(delta) || 1;
    let next = index + delta;
    while (next >= 0 && next < flatDays.length && !flatDays[next].selectable) {
      next += direction;
    }
    if (next < 0 || next >= flatDays.length) return;
    const day = flatDays[next];
    const month = parentSearchCalendarMonthOf(day.iso);
    if (month && (month.year !== cursor.year || month.monthIndex !== cursor.monthIndex)) {
      setCursor(month);
    }
    setFocusIso(day.iso);
  };

  const label = value ? formatParentSearchDateLabel(value) : "בחרו תאריך";

  return (
    <div ref={rootRef} className={`relative ${open ? "z-30" : ""}`} data-parent-search-date="">
      <button
        type="button"
        className={`${className} flex items-center justify-between gap-2 text-right`}
        disabled={disabled}
        aria-invalid={invalid}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className={value ? "truncate" : "truncate text-slate-400"}>{label}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="לוח שנה"
          dir="rtl"
          style={{ backgroundColor: "#FFFFFF" }}
          className={`absolute z-40 mt-1 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-3 text-[#001F3F] shadow-soft ${
            align === "end" ? "end-0" : "start-0"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="inline-flex h-11 min-h-[44px] w-11 items-center justify-center rounded-xl text-[#001F3F] hover:bg-slate-50"
              aria-label="חודש קודם"
              onClick={() => setCursor((current) => shiftMonth(current.year, current.monthIndex, -1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <p className="text-sm font-semibold">{parentSearchCalendarMonthLabel(cursor.year, cursor.monthIndex)}</p>
            <button
              type="button"
              className="inline-flex h-11 min-h-[44px] w-11 items-center justify-center rounded-xl text-[#001F3F] hover:bg-slate-50"
              aria-label="חודש הבא"
              onClick={() => setCursor((current) => shiftMonth(current.year, current.monthIndex, 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div role="grid" aria-label={parentSearchCalendarMonthLabel(cursor.year, cursor.monthIndex)}>
            <div role="row" className="mb-1 grid grid-cols-7">
              {WEEKDAYS.map((weekday, index) => (
                <span
                  key={`${weekday}-${index}`}
                  role="columnheader"
                  className="flex h-8 items-center justify-center text-xs font-medium text-slate-500"
                >
                  {weekday}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0].iso} role="row" className="grid grid-cols-7">
                {week.map((day) => {
                  const selected = day.iso === value;
                  const today = day.iso === todayIso;
                  const dayNumber = Number(day.iso.slice(8, 10));
                  return (
                    <div key={day.iso} role="gridcell" className="flex items-center justify-center">
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) dayRefs.current.set(day.iso, node);
                          else dayRefs.current.delete(day.iso);
                        }}
                        disabled={!day.selectable}
                        tabIndex={day.selectable && day.iso === focusIso ? 0 : -1}
                        aria-disabled={!day.selectable}
                        aria-selected={selected}
                        aria-current={today ? "date" : undefined}
                        onClick={() => choose(day.iso)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowLeft") {
                            event.preventDefault();
                            moveFocus(1);
                          } else if (event.key === "ArrowRight") {
                            event.preventDefault();
                            moveFocus(-1);
                          } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            moveFocus(7);
                          } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            moveFocus(-7);
                          } else if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            choose(day.iso);
                          }
                        }}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium ${
                          !day.selectable
                            ? "cursor-not-allowed bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#F3F4F6]"
                            : selected
                              ? "bg-[#001F3F] text-white"
                              : `text-[#001F3F] hover:bg-slate-50 ${today ? "ring-1 ring-[#001F3F]" : ""} ${
                                  day.inMonth ? "" : "opacity-70"
                                }`
                        }`}
                      >
                        {dayNumber}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {value ? (
            <button
              type="button"
              className="mt-2 h-11 min-h-[44px] w-full rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              נקה
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
