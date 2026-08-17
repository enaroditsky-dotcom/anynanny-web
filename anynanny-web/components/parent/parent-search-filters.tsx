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
import { RequiredFieldMark } from "@/components/ui/required-field-mark";

const EXPERIENCE_OPTIONS: { value: ParentSearchMinExperience; label: string }[] = [
  { value: 0, label: "ללא הגבלה" },
  { value: 1, label: "שנה ומעלה" },
  { value: 3, label: "3 שנים ומעלה" },
  { value: 5, label: "5 שנים ומעלה" }
];

const FIELD_LABEL =
  "mb-1.5 block min-h-[1.5rem] text-right text-base font-medium leading-snug text-[#001F3F]";
const SECTION_HEADING = "text-lg font-semibold leading-snug text-[#001F3F]";
const SECTION_SURFACE =
  "rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft";
const FIELD_CONTROL =
  "box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-slate-200/80 bg-white px-3 text-base font-medium leading-none text-[#001F3F] transition placeholder:text-slate-400 focus:border-[#001F3F] focus:outline-none focus:ring-2 focus:ring-[#001F3F]/15 disabled:opacity-50 appearance-none";
const FIELD_CONTROL_INVALID =
  "box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-rose-400 bg-white px-3 text-base font-medium leading-none text-[#001F3F] ring-1 ring-rose-200 transition placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-50 appearance-none";
const DATE_CONTROL =
  "parent-search-date box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-slate-200/80 bg-white px-2.5 text-base font-medium text-[#001F3F] outline-none transition focus:border-[#001F3F] focus:ring-2 focus:ring-[#001F3F]/15 disabled:opacity-50";
const DATE_CONTROL_INVALID =
  "parent-search-date box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-rose-400 bg-white px-2.5 text-base font-medium text-[#001F3F] outline-none ring-1 ring-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-300 disabled:opacity-50";
const TIME_SELECT =
  "mt-1 box-border block h-11 min-h-[44px] w-full rounded-xl border border-slate-200/80 bg-white px-2 text-base font-medium text-[#001F3F] outline-none transition focus:border-[#001F3F] focus:ring-2 focus:ring-[#001F3F]/15 disabled:opacity-50";
const TIME_SELECT_INVALID =
  "mt-1 box-border block h-11 min-h-[44px] w-full rounded-xl border border-rose-400 bg-white px-2 text-base font-medium text-[#001F3F] outline-none ring-1 ring-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-300 disabled:opacity-50";
const FIELD_ICON =
  "pointer-events-none absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400";
const PAIR_COL = "flex min-w-0 flex-col";

function FieldLabel({
  children,
  required = false
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <span className={FIELD_LABEL}>
      <span className="inline-flex items-center gap-1.5">
        {required ? <RequiredFieldMark /> : null}
        <span className="leading-snug">{children}</span>
      </span>
    </span>
  );
}

function TimeBlock({
  title,
  hour,
  minute,
  disabled,
  invalid,
  required,
  onHourChange,
  onMinuteChange
}: {
  title: string;
  hour: string;
  minute: ParentSearchMinute | "";
  disabled: boolean;
  invalid?: boolean;
  required?: boolean;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: ParentSearchMinute | "") => void;
}) {
  const selectClass = invalid ? TIME_SELECT_INVALID : TIME_SELECT;
  return (
    <div
      className={`flex h-full flex-col rounded-xl border p-3 ${
        invalid ? "border-rose-300 bg-rose-50/40" : "border-slate-100 bg-[#FDFBF6]"
      }`}
    >
      <FieldLabel required={required}>{title}</FieldLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block min-w-0 text-right text-sm font-medium leading-none text-slate-500">
          <span className="mb-0 block min-h-[1rem]">שעה</span>
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

        <label className="block min-w-0 text-right text-sm font-medium leading-none text-slate-500">
          <span className="mb-0 block min-h-[1rem]">דק׳</span>
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
    <section className="flex flex-col gap-4" dir="rtl">
      <div className={`${SECTION_SURFACE} grid grid-cols-2 items-start gap-3`}>
        <div className={PAIR_COL}>
          <FieldLabel>מספר ID</FieldLabel>
          <div className="relative">
            <Search className={FIELD_ICON} />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="AN-...."
              className={`${FIELD_CONTROL} pr-9`}
              value={filters.searchSitterSerial}
              onChange={(e) => patch({ searchSitterSerial: e.target.value })}
            />
          </div>
        </div>

        <div className={`relative z-10 overflow-visible ${PAIR_COL}`}>
          <FieldLabel required>עיר פעילות</FieldLabel>
          <CityAutocomplete
            value={filters.selectedCity}
            onChange={(selectedCity) => patch({ selectedCity })}
            invalid={cityInvalid}
            inputClassName={`${cityInvalid ? FIELD_CONTROL_INVALID : FIELD_CONTROL} pr-9 pl-10`}
          />
        </div>
      </div>

      <div className={`${SECTION_SURFACE} space-y-3`}>
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Calendar className="h-4 w-4" />
          </span>
          <span className={SECTION_HEADING}>מתי העבודה נדרשת?</span>
        </div>

        <div className="grid grid-cols-2 items-start gap-3">
          <div className={`${PAIR_COL} gap-2`}>
            <FieldLabel required>תאריך התחלה</FieldLabel>
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
              required
              hour={filters.searchStartHour ?? ""}
              minute={filters.searchStartMinute ?? ""}
              disabled={!filters.searchDate}
              invalid={startTimeInvalid}
              onHourChange={(searchStartHour) => patch({ searchStartHour })}
              onMinuteChange={(searchStartMinute) => patch({ searchStartMinute })}
            />
          </div>

          <div className={`${PAIR_COL} gap-2`}>
            <FieldLabel required>תאריך סיום</FieldLabel>
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
              required
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

      <div className={`${SECTION_SURFACE} grid grid-cols-2 items-start gap-3`}>
        <div className={PAIR_COL}>
          <FieldLabel>שנות ניסיון</FieldLabel>
          <div className="relative">
            <Award className={FIELD_ICON} />
            <select
              className={`${FIELD_CONTROL} pr-9`}
              value={String(filters.minYearsExperience)}
              onChange={(e) => patch({ minYearsExperience: Number(e.target.value) as ParentSearchMinExperience })}
            >
              {EXPERIENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={PAIR_COL}>
          <FieldLabel>דירוג מינימלי</FieldLabel>
          <div className="relative">
            <Star className={FIELD_ICON} />
            <select
              className={`${FIELD_CONTROL} pr-9`}
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