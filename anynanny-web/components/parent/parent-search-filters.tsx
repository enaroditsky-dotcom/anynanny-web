"use client";

import {
  PARENT_SEARCH_HOUR_OPTIONS,
  PARENT_SEARCH_MAX_HOURLY_SLIDER,
  PARENT_SEARCH_MINUTE_OPTIONS,
  PARENT_SEARCH_RATING_OPTIONS,
  type ParentSearchFilters,
  type ParentSearchMinute,
  type ParentSearchMinExperience,
  type ParentSearchMinRating
} from "@/lib/sitter/parent-search-filters";
import { ISRAEL_CITIES, type IsraelCity } from "@/lib/geo/israel-cities";
import { MapPin, Search, Calendar, Award, Star } from "lucide-react";

const EXPERIENCE_OPTIONS: { value: ParentSearchMinExperience; label: string }[] = [
  { value: 0, label: "ללא הגבלה" },
  { value: 1, label: "שנה ומעלה" },
  { value: 3, label: "3 שנים ומעלה" },
  { value: 5, label: "5 שנים ומעלה" }
];

const FIELD_LABEL = "block text-right text-xs font-bold text-slate-500 mb-1.5 mr-0.5";
const FIELD_CONTROL =
  "block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 transition focus:border-[#001F3F] focus:outline-none focus:ring-1 focus:ring-[#001F3F] disabled:opacity-50 appearance-none";

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
    <div className="rounded-xl border border-slate-100 bg-white/80 p-2.5 shadow-xs">
      <p className="mb-1 text-right text-[11px] font-bold text-navy-header">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block text-right text-[10px] text-slate-400">
          שעה
          <select
            className="mt-0.5 block h-9 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-[#001F3F]"
            value={hour}
            disabled={disabled}
            onChange={(e) => onHourChange(e.target.value)}
          >
            <option value="">—</option>
            {PARENT_SEARCH_HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </label>

        <label className="block text-right text-[10px] text-slate-400">
          דק׳
          <select
            className="mt-0.5 block h-9 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-[#001F3F]"
            value={minute}
            disabled={disabled}
            onChange={(e) => onMinuteChange(e.target.value as ParentSearchMinute | "")}
          >
            <option value="">—</option>
            {PARENT_SEARCH_MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
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
      searchStartHour: partial.searchStartHour !== undefined ? String(partial.searchStartHour) : filters.searchStartHour ?? "",
      searchStartMinute: partial.searchStartMinute !== undefined ? (String(partial.searchStartMinute) as ParentSearchMinute | "") : filters.searchStartMinute ?? "",
      searchEndHour: partial.searchEndHour !== undefined ? String(partial.searchEndHour) : filters.searchEndHour ?? "",
      searchEndMinute: partial.searchEndMinute !== undefined ? (String(partial.searchEndMinute) as ParentSearchMinute | "") : filters.searchEndMinute ?? ""
    });
  };

  const clearTimes = {
    searchEndDate: "",
    searchStartHour: "",
    searchStartMinute: "" as const,
    searchEndHour: "",
    searchEndMinute: "" as const
  };

  return (
    <section className="flex flex-col space-y-4 rounded-2xl bg-transparent" dir="rtl">
      
      {/* 📍 קוביית מיקום ומזהה: סימטריים זה לצד זה */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className={FIELD_LABEL}>מספר אישי (אופציונלי)</label>
          <div className="relative flex items-center">
            <Search className="absolute right-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="AN-1001"
              className={`${FIELD_CONTROL} pr-9`}
              value={filters.searchSitterSerial}
              onChange={(e) => patch({ searchSitterSerial: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <label className={FIELD_LABEL}>עיר פעילות</label>
          <div className="relative flex items-center">
            <MapPin className="absolute right-3 h-4 w-4 text-slate-400" />
            <select
              className={`${FIELD_CONTROL} pr-9`}
              value={filters.selectedCity}
              onChange={(e) => patch({ selectedCity: (e.target.value || "") as IsraelCity | "" })}
            >
              <option value="">בחר עיר…</option>
              {ISRAEL_CITIES.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 📅 קוביית זמנים ותאריכים: קוביית בוטיק שמנת חמה ונקייה */}
      <div className="rounded-2xl border border-slate-100 bg-[#FDFBF6]/80 p-3.5 space-y-3 shadow-inner">
        <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
          <Calendar className="h-4 w-4 text-navy-header" />
          <span className="text-xs font-bold text-navy-header">מתי העבודה נדרשת?</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* בלוק התחלה */}
          <div className="space-y-2">
            <label className="block text-right text-[11px] font-semibold text-slate-500">תאריך התחלה</label>
            <input
              type="date"
              className="block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-[#001F3F]"
              value={filters.searchDate}
              onChange={(e) => {
                const searchDate = e.target.value;
                if (!searchDate) {
                  patch({ searchDate: "", ...clearTimes });
                } else {
                  patch({
                    searchDate,
                    searchEndDate: !filters.searchEndDate || filters.searchEndDate === filters.searchDate ? searchDate : filters.searchEndDate
                  });
                }
              }}
            />
            <TimeBlock
              title="שעת התחלה"
              hour={filters.searchStartHour ?? ""}
              minute={filters.searchStartMinute ?? ""}
              disabled={!filters.searchDate}
              onHourChange={(searchStartHour) => patch({ searchStartHour })}
              onMinuteChange={(searchStartMinute) => patch({ searchStartMinute })}
            />
          </div>

          {/* בלוק סיום */}
          <div className="space-y-2 border-r border-slate-200/40 pr-3">
            <label className="block text-right text-[11px] font-semibold text-slate-500">תאריך סיום</label>
            <input
              type="date"
              className="block h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-[#001F3F]"
              min={filters.searchDate || undefined}
              value={filters.searchEndDate}
              disabled={!filters.searchDate}
              onChange={(e) => patch({ searchEndDate: e.target.value })}
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
        </div>
      </div>

      {/* 🌟 קוביית איכות: שנות ניסיון ודירוג זה לצד זה */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className={FIELD_LABEL}>שנות ניסיון</label>
          <div className="relative flex items-center">
            <Award className="absolute right-3 h-4 w-4 text-slate-400" />
            <select
              className={`${FIELD_CONTROL} pr-9 text-xs font-semibold`}
              value={String(filters.minYearsExperience)}
              onChange={(e) => patch({ minYearsExperience: Number(e.target.value) as ParentSearchMinExperience })}
            >
              {EXPERIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col">
          <label className={FIELD_LABEL}>דירוג מינימלי</label>
          <div className="relative flex items-center">
            <Star className="absolute right-3 h-4 w-4 text-slate-400" />
            <select
              className={`${FIELD_CONTROL} pr-9 text-xs font-semibold`}
              value={filters.minRating ?? "all"}
              onChange={(e) => patch({ minRating: e.target.value as ParentSearchMinRating })}
            >
              {PARENT_SEARCH_RATING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 💰 סליידר מחיר שעתי מעוצב */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-xs">
        <div className="flex items-center justify-between text-xs font-bold text-slate-500">
          <span className="font-black text-sm text-emerald-700 tabular-nums bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
            ₪{filters.maxHourlyRate}
          </span>
          <span>מחיר שעתי מקסימלי:</span>
        </div>
        <input
          type="range"
          min={0}
          max={PARENT_SEARCH_MAX_HOURLY_SLIDER}
          step={5}
          className="mt-2.5 h-1.5 w-full cursor-pointer accent-[#001F3F] bg-slate-100 rounded-lg appearance-none transition-all"
          value={filters.maxHourlyRate}
          onChange={(e) => patch({ maxHourlyRate: Number(e.target.value) })}
        />
      </div>

    </section>
  );
}