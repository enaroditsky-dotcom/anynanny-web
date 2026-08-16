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
import {
  parentSearchFieldIsInvalid,
  type ParentSearchMandatoryField
} from "@/lib/sitter/parent-search-validation";
import { CityAutocomplete } from "@/components/geo/city-autocomplete";
import {
  SEARCH_LIMIT_CLEAR_BUTTON,
  SEARCH_LIMIT_SLIDER_CLASS,
  SEARCH_LIMIT_SLIDER_ENDS,
  SEARCH_LIMIT_VALUE_BADGE,
  SEARCH_LIMIT_VALUE_ROW,
  SearchLimitToggleCard,
  searchLimitSliderProgress
} from "@/components/parent/search-limit-toggle-card";
import { Search, Calendar, Award, Star } from "lucide-react";

const EXPERIENCE_OPTIONS: { value: ParentSearchMinExperience; label: string }[] = [
  { value: 0, label: "ללא הגבלה" },
  { value: 1, label: "שנה ומעלה" },
  { value: 3, label: "3 שנים ומעלה" },
  { value: 5, label: "5 שנים ומעלה" }
];

const FIELD_LABEL = "mb-1.5 mr-0.5 block text-right text-[14px] font-bold text-[#001F3F]";
const SECTION_HEADING = "text-[16px] font-bold leading-snug text-[#001F3F]";
const SECTION_SURFACE =
  "rounded-[1.25rem] border border-[#001F3F]/10 bg-[#FBF8F1] p-4 shadow-[0_1px_6px_rgba(0,31,63,0.04)]";
const FIELD_CONTROL =
  "block min-h-[44px] w-full rounded-xl border border-slate-300/90 bg-white px-3 py-2.5 text-[15px] font-medium text-[#001F3F] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition placeholder:text-slate-400 focus:border-[#001F3F] focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20 disabled:opacity-50 appearance-none";
const FIELD_CONTROL_INVALID =
  "block min-h-[44px] w-full rounded-xl border border-rose-400 bg-white px-3 py-2.5 text-[15px] font-medium text-[#001F3F] ring-1 ring-rose-200 transition placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-50 appearance-none";
const DATE_CONTROL =
  "block min-h-[44px] h-11 w-full rounded-xl border border-slate-300/90 bg-white px-3 text-[15px] font-medium text-[#001F3F] outline-none transition focus:border-[#001F3F] focus:ring-2 focus:ring-[#001F3F]/20";
const DATE_CONTROL_INVALID =
  "block min-h-[44px] h-11 w-full rounded-xl border border-rose-400 bg-white px-3 text-[15px] font-medium text-[#001F3F] outline-none ring-1 ring-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-300";
const TIME_SELECT =
  "mt-0.5 block h-11 min-h-[42px] w-full rounded-lg border border-slate-300/90 bg-white px-2 py-1 text-[15px] font-medium text-[#001F3F] outline-none transition focus:border-[#001F3F] focus:ring-2 focus:ring-[#001F3F]/20";
const TIME_SELECT_INVALID =
  "mt-0.5 block h-11 min-h-[42px] w-full rounded-lg border border-rose-400 bg-white px-2 py-1 text-[15px] font-medium text-[#001F3F] outline-none ring-1 ring-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-300";

function TimeBlock({
  title,
  hour,
  minute,
  disabled,
  invalid,
  onHourChange,
  onMinuteChange
}: {
  title: string;
  hour: string;
  minute: ParentSearchMinute | "";
  disabled: boolean;
  invalid?: boolean;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: ParentSearchMinute | "") => void;
}) {
  const selectClass = invalid ? TIME_SELECT_INVALID : TIME_SELECT;
  return (
    <div
      className={`rounded-xl border bg-white p-3 ${
        invalid ? "border-rose-400" : "border-slate-300/70"
      }`}
    >
      <p className="mb-1.5 text-right text-[15px] font-bold text-[#001F3F]">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block text-right text-[13px] font-semibold text-slate-500">
          שעה
          <select
            className={selectClass}
            value={hour}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(e) => onHourChange(e.target.value)}
          >
            <option value="">—</option>
            {PARENT_SEARCH_HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </label>

        <label className="block text-right text-[13px] font-semibold text-slate-500">
          דק׳
          <select
            className={selectClass}
            value={minute}
            disabled={disabled}
            aria-invalid={invalid}
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
  onChange,
  invalidFields
}: {
  filters: ParentSearchFilters;
  onChange: (next: ParentSearchFilters) => void;
  invalidFields?: readonly ParentSearchMandatoryField[];
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

  const cityInvalid = parentSearchFieldIsInvalid(invalidFields, "selectedCity");
  const startDateInvalid = parentSearchFieldIsInvalid(invalidFields, "searchDate");
  const endDateInvalid = parentSearchFieldIsInvalid(invalidFields, "searchEndDate");
  const startTimeInvalid = parentSearchFieldIsInvalid(invalidFields, "searchStartTime");
  const endTimeInvalid = parentSearchFieldIsInvalid(invalidFields, "searchEndTime");

  return (
    <section className="flex flex-col space-y-5 rounded-2xl bg-transparent" dir="rtl">
      
      {/* 📍 קוביית מיקום ומזהה: סימטריים זה לצד זה */}
      <div className={`${SECTION_SURFACE} grid grid-cols-2 gap-3`}>
        <div className="flex flex-col">
          <label className={FIELD_LABEL}>מספר אישי (אופציונלי)</label>
          <div className="relative flex items-center">
            <Search className="absolute right-3 h-[18px] w-[18px] text-slate-400" />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="001 / AN-1001"
              className={`${FIELD_CONTROL} pr-9`}
              value={filters.searchSitterSerial}
              onChange={(e) => patch({ searchSitterSerial: e.target.value })}
            />
          </div>
        </div>

        <div className="relative z-10 flex min-w-0 flex-col overflow-visible">
          <label className={FIELD_LABEL}>עיר פעילות</label>
          <CityAutocomplete
            value={filters.selectedCity}
            onChange={(selectedCity) => patch({ selectedCity })}
            invalid={cityInvalid}
            inputClassName={`${cityInvalid ? FIELD_CONTROL_INVALID : FIELD_CONTROL} pr-9 pl-10`}
          />
        </div>
      </div>

      {/* 📅 קוביית זמנים ותאריכים */}
      <div className={`${SECTION_SURFACE} space-y-3`}>
        <div className="flex items-center gap-1.5 border-b border-[#001F3F]/10 pb-2.5">
          <Calendar className="h-[18px] w-[18px] text-[#001F3F]" />
          <span className={SECTION_HEADING}>מתי העבודה נדרשת?</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* בלוק התחלה */}
          <div className="min-w-0 space-y-2">
            <label className={FIELD_LABEL}>תאריך התחלה</label>
            <input
              type="date"
              className={startDateInvalid ? DATE_CONTROL_INVALID : DATE_CONTROL}
              value={filters.searchDate}
              aria-invalid={startDateInvalid}
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
              invalid={startTimeInvalid}
              onHourChange={(searchStartHour) => patch({ searchStartHour })}
              onMinuteChange={(searchStartMinute) => patch({ searchStartMinute })}
            />
          </div>

          {/* בלוק סיום */}
          <div className="min-w-0 space-y-2 border-r border-slate-200/40 pr-3">
            <label className={FIELD_LABEL}>תאריך סיום</label>
            <input
              type="date"
              className={endDateInvalid ? DATE_CONTROL_INVALID : DATE_CONTROL}
              min={filters.searchDate || undefined}
              value={filters.searchEndDate}
              disabled={!filters.searchDate}
              aria-invalid={endDateInvalid}
              onChange={(e) => patch({ searchEndDate: e.target.value })}
            />
            <TimeBlock
              title="שעת סיום"
              hour={filters.searchEndHour ?? ""}
              minute={filters.searchEndMinute ?? ""}
              disabled={!filters.searchDate}
              invalid={endTimeInvalid}
              onHourChange={(searchEndHour) => patch({ searchEndHour })}
              onMinuteChange={(searchEndMinute) => patch({ searchEndMinute })}
            />
          </div>
        </div>
      </div>

      {/* 🌟 קוביית איכות: שנות ניסיון ודירוג זה לצד זה */}
      <div className={`${SECTION_SURFACE} grid grid-cols-2 gap-3`}>
        <div className="flex flex-col">
          <label className={`${SECTION_HEADING} mb-2`}>שנות ניסיון</label>
          <div className="relative flex items-center">
            <Award className="absolute right-3 h-[18px] w-[18px] text-slate-400" />
            <select
              className={`${FIELD_CONTROL} pr-9 font-semibold`}
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
          <label className={`${SECTION_HEADING} mb-2`}>דירוג מינימלי</label>
          <div className="relative flex items-center">
            <Star className="absolute right-3 h-[18px] w-[18px] text-slate-400" />
            <select
              className={`${FIELD_CONTROL} pr-9 font-semibold`}
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

      <SearchLimitToggleCard
        title="מחיר שעתי מקסימלי"
        toggleLabel="הגבל מחיר"
        enabled={filters.maxHourlyRate != null}
        onEnabledChange={(enabled) =>
          patch({
            maxHourlyRate: enabled ? PARENT_SEARCH_MAX_HOURLY_SLIDER : null
          })
        }
        inactiveHint="ללא הגבלת מחיר"
      >
        <div className={SEARCH_LIMIT_VALUE_ROW}>
          <button
            type="button"
            onClick={() => patch({ maxHourlyRate: null })}
            className={SEARCH_LIMIT_CLEAR_BUTTON}
          >
            נקה הגבלה
          </button>
          <span className={SEARCH_LIMIT_VALUE_BADGE}>
            ₪{filters.maxHourlyRate}
          </span>
        </div>
        <div dir="ltr">
          <input
            type="range"
            min={0}
            max={PARENT_SEARCH_MAX_HOURLY_SLIDER}
            step={5}
            className={SEARCH_LIMIT_SLIDER_CLASS}
            style={searchLimitSliderProgress(
              filters.maxHourlyRate ?? PARENT_SEARCH_MAX_HOURLY_SLIDER,
              0,
              PARENT_SEARCH_MAX_HOURLY_SLIDER
            )}
            value={filters.maxHourlyRate ?? PARENT_SEARCH_MAX_HOURLY_SLIDER}
            onChange={(e) => patch({ maxHourlyRate: Number(e.target.value) })}
          />
          <div className={SEARCH_LIMIT_SLIDER_ENDS}>
            <span>₪0</span>
            <span>₪{PARENT_SEARCH_MAX_HOURLY_SLIDER}</span>
          </div>
        </div>
      </SearchLimitToggleCard>

    </section>
  );
}