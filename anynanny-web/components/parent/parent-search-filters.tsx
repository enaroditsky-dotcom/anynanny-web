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
  { value: 0, label: "0+" },
  { value: 1, label: "1+" },
  { value: 3, label: "3+" },
  { value: 5, label: "5+" }
];

const TRANSPORT_OPTIONS: { value: ParentSearchTransportFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "self", label: "עצמאית" },
  { value: "taxi", label: "מונית" }
];

const FIELD_LABEL = "block text-right text-xs font-semibold text-navy-header";
const FIELD_CONTROL =
  "mt-1.5 block min-h-11 w-full rounded-xl border border-slate-200 bg-[#FDFBF6]/40 px-3.5 py-2 text-sm text-slate-800 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 appearance-none";

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
    <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <p className="mb-1 text-right text-xs font-bold text-navy-header">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-right text-[11px] text-slate-500">
          שעה
          <div className="relative">
            <select
              className={FIELD_CONTROL}
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
          </div>
        </label>

        <label className="block text-right text-[11px] text-slate-500">
          דק׳
          <div className="relative">
            <select
              className={FIELD_CONTROL}
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
          </div>
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
      className="flex min-h-0 flex-1 flex-col space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft"
      dir="rtl"
      aria-label="סינון חיפוש נני"
    >
      <label className={FIELD_LABEL}>
        מספר נני אישי
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="AN-1001"
          className={FIELD_CONTROL}
          value={filters.searchSitterSerial}
          onChange={(e) => patch({ searchSitterSerial: e.target.value })}
        />
      </label>

      <label className={FIELD_LABEL}>
        עיר
        <div className="relative">
          <select
            className={FIELD_CONTROL}
            value={filters.selectedCity}
            onChange={(e) =>
              patch({ selectedCity: (e.target.value || "") as IsraelCity | "" })
            }
          >
            <option value="">בחר עיר…</option>
            {ISRAEL_CITIES.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      </label>

      <fieldset className="space-y-2 rounded-xl border border-slate-100 bg-[#FDFBF6]/50 p-3">
        <legend className="px-1.5 text-right text-xs font-bold text-navy-header">תאריך ושעות נדרשות</legend>

        <label className="block text-right text-xs font-semibold text-navy-header">
          תאריך
          <input
            type="date"
            className={`${FIELD_CONTROL} bg-white tabular-nums`}
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

        <div className="grid grid-cols-2 gap-2.5">
          <TimeBlock
            title="התחלה"
            hour={filters.searchStartHour ?? ""}
            minute={filters.searchStartMinute ?? ""}
            disabled={!filters.searchDate}
            onHourChange={(searchStartHour) => patch({ searchStartHour })}
            onMinuteChange={(searchStartMinute) => patch({ searchStartMinute })}
          />
          <TimeBlock
            title="סיום"
            hour={filters.searchEndHour ?? ""}
            minute={filters.searchEndMinute ?? ""}
            disabled={!filters.searchDate}
            onHourChange={(searchEndHour) => patch({ searchEndHour })}
            onMinuteChange={(searchEndMinute) => patch({ searchEndMinute })}
          />
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className={FIELD_LABEL}>
          שנות ניסיון
          <select
            className={FIELD_CONTROL}
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

        <label className={FIELD_LABEL}>
          דירוג לפחות
          <select
            className={FIELD_CONTROL}
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

      <label className={FIELD_LABEL}>
        דרך הגעה
        <select
          className={FIELD_CONTROL}
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

      <div className="text-right pt-1">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-navy-header">
          <span className="font-bold text-sm text-emerald-800 tabular-nums">₪{filters.maxHourlyRate}</span>
          <span>מחיר שעתי מקסימלי</span>
        </div>
        <input
          type="range"
          min={0}
          max={PARENT_SEARCH_MAX_HOURLY_SLIDER}
          step={5}
          className="mt-2 h-1.5 w-full cursor-pointer accent-[#001F3F] bg-slate-100 rounded-lg appearance-none"
          value={filters.maxHourlyRate}
          onChange={(e) => patch({ maxHourlyRate: Number(e.target.value) })}
        />
      </div>
    </section>
  );
}