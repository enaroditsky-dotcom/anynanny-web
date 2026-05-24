"use client";

import {
  PARENT_SEARCH_HOUR_OPTIONS,
  PARENT_SEARCH_MAX_HOURLY_SLIDER,
  PARENT_SEARCH_MINUTE_OPTIONS,
  PARENT_SEARCH_RATING_OPTIONS,
  type ParentSearchFilters,
  type ParentSearchMinute,
  type ParentSearchMinExperience,
  type ParentSearchMinRating,
  type ParentSearchTransportFilter
} from "@/lib/sitter/parent-search-filters";
import { ISRAEL_CITIES, type IsraelCity } from "@/lib/geo/israel-cities";

const EXPERIENCE_OPTIONS: { value: ParentSearchMinExperience; label: string }[] = [
  { value: 0, label: "0+ שנים" },
  { value: 1, label: "1+ שנים" },
  { value: 3, label: "3+ שנים" },
  { value: 5, label: "5+ שנים" }
];

const TRANSPORT_OPTIONS: { value: ParentSearchTransportFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "self", label: "עצמאית" },
  { value: "taxi", label: "צריכה מונית" }
];

function TimeBlock({
  title,
  hour,
  minute,
  disabled,
  onHourChange,
  onMinuteChange
}: {
  title: string;
  hour: string;
  minute: ParentSearchMinute | "";
  disabled: boolean;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: ParentSearchMinute | "") => void;
}) {
  return (
    <div className="rounded-xl border border-navy-header/10 bg-white p-2.5">
      <p className="mb-2 text-right text-xs font-semibold text-navy-900">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-right text-xs text-slate-600">
          שעה
          <select
            className="mt-1 block min-h-10 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-2 py-2 text-sm tabular-nums disabled:opacity-50"
            value={hour}
            disabled={disabled}
            onChange={(e) => onHourChange(e.target.value)}
          >
            <option value="">—</option>
            {PARENT_SEARCH_HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-right text-xs text-slate-600">
          דקות
          <select
            className="mt-1 block min-h-10 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-2 py-2 text-sm tabular-nums disabled:opacity-50"
            value={minute}
            disabled={disabled}
            onChange={(e) => onMinuteChange(e.target.value as ParentSearchMinute | "")}
          >
            <option value="">—</option>
            {PARENT_SEARCH_MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function ParentSearchFiltersBar({
  filters,
  onChange
}: {
  filters: ParentSearchFilters;
  onChange: (next: ParentSearchFilters) => void;
}) {
  const patch = (partial: Partial<ParentSearchFilters>) => {
    onChange({
      ...filters,
      ...partial,
      searchStartHour:
        partial.searchStartHour !== undefined ? String(partial.searchStartHour) : filters.searchStartHour ?? "",
      searchStartMinute:
        partial.searchStartMinute !== undefined
          ? (String(partial.searchStartMinute) as ParentSearchMinute | "")
          : filters.searchStartMinute ?? "",
      searchEndHour: partial.searchEndHour !== undefined ? String(partial.searchEndHour) : filters.searchEndHour ?? "",
      searchEndMinute:
        partial.searchEndMinute !== undefined
          ? (String(partial.searchEndMinute) as ParentSearchMinute | "")
          : filters.searchEndMinute ?? ""
    });
  };

  const clearTimes = {
    searchStartHour: "",
    searchStartMinute: "" as const,
    searchEndHour: "",
    searchEndMinute: "" as const
  };

  return (
    <section
      className="space-y-3 rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft"
      dir="rtl"
      aria-label="סינון חיפוש נני"
    >
      <label className="block text-right text-sm text-navy-900">
        חפש לפי מספר נני אישי
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="לדוגמה AN-1001"
          className="mt-1 block min-h-11 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-3 py-2 text-sm"
          value={filters.searchSitterSerial}
          onChange={(e) => patch({ searchSitterSerial: e.target.value })}
        />
      </label>

      <label className="block text-right text-sm text-navy-900">
        עיר חיפוש
        <select
          className="mt-1 block min-h-11 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-3 py-2 text-sm"
          value={filters.selectedCity}
          onChange={(e) =>
            patch({ selectedCity: (e.target.value || "") as IsraelCity | "" })
          }
        >
          <option value="">בחר עיר חיפוש...</option>
          {ISRAEL_CITIES.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-3 rounded-xl border border-navy-header/10 bg-[#FDFBF6]/60 p-3">
        <legend className="px-1 text-right text-sm font-semibold text-navy-900">תאריך ושעה נדרשים</legend>

        <label className="block text-right text-xs text-slate-600">
          תאריך
          <input
            type="date"
            className="mt-1 block min-h-11 w-full rounded-xl border border-navy-header/20 bg-white px-3 py-2 text-sm tabular-nums"
            value={filters.searchDate}
            onChange={(e) => {
              const searchDate = e.target.value;
              if (!searchDate) {
                patch({ searchDate: "", ...clearTimes });
              } else {
                patch({ searchDate });
              }
            }}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TimeBlock
            title="שעת התחלה"
            hour={filters.searchStartHour ?? ""}
            minute={filters.searchStartMinute ?? ""}
            disabled={!filters.searchDate}
            onHourChange={(searchStartHour) => patch({ searchStartHour })}
            onMinuteChange={(searchStartMinute) => patch({ searchStartMinute })}
          />
          <TimeBlock
            title="שעת סיום"
            hour={filters.searchEndHour ?? ""}
            minute={filters.searchEndMinute ?? ""}
            disabled={!filters.searchDate}
            onHourChange={(searchEndHour) => patch({ searchEndHour })}
            onMinuteChange={(searchEndMinute) => patch({ searchEndMinute })}
          />
        </div>

        {!filters.searchDate ? (
          <p className="text-right text-xs text-slate-500">בחרו תאריך ואז הגדירו טווח שעות (פורמט 24 שעות).</p>
        ) : (
          <p className="text-right text-xs text-slate-500">
            שעות ריקות: התחלה 00:00, סיום 23:59. חיפוש בודק זמינות לכל הטווח.
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-right text-sm text-navy-900">
          שנות ניסיון לפחות
          <select
            className="mt-1 block min-h-11 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-3 py-2 text-sm"
            value={String(filters.minYearsExperience)}
            onChange={(e) =>
              patch({ minYearsExperience: Number(e.target.value) as ParentSearchMinExperience })
            }
          >
            {EXPERIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-right text-sm text-navy-900">
          דירוג בייביסיטר לפחות
          <select
            className="mt-1 block min-h-11 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-3 py-2 text-sm"
            value={filters.minRating ?? "all"}
            onChange={(e) => patch({ minRating: e.target.value as ParentSearchMinRating })}
          >
            {PARENT_SEARCH_RATING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-right text-sm text-navy-900">
        דרך הגעה
        <select
          className="mt-1 block min-h-11 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-3 py-2 text-sm"
          value={filters.transport}
          onChange={(e) => patch({ transport: e.target.value as ParentSearchTransportFilter })}
        >
          {TRANSPORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="text-right">
        <div className="flex items-center justify-between gap-2 text-sm text-navy-900">
          <span className="font-semibold tabular-nums">₪{filters.maxHourlyRate}</span>
          <span>מחיר שעתי מקסימלי</span>
        </div>
        <input
          type="range"
          min={0}
          max={PARENT_SEARCH_MAX_HOURLY_SLIDER}
          step={5}
          className="mt-2 h-2 w-full cursor-pointer accent-[#001F3F]"
          value={filters.maxHourlyRate}
          onChange={(e) => patch({ maxHourlyRate: Number(e.target.value) })}
        />
        <p className="mt-1 text-xs text-slate-500">0 — {PARENT_SEARCH_MAX_HOURLY_SLIDER} ₪ לשעה</p>
      </div>
    </section>
  );
}
