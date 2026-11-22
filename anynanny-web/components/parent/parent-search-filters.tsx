"use client";

import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from "react";
import {
  PARENT_SEARCH_HOUR_OPTIONS,
  PARENT_SEARCH_MAX_HOURLY_SLIDER,
  PARENT_SEARCH_MINUTE_OPTIONS,
  PARENT_SEARCH_RATING_OPTIONS,
  PARENT_SEARCH_VERIFIED_ONLY_HINT,
  PARENT_SEARCH_VERIFIED_ONLY_LABEL,
  type ParentSearchFilters,
  type ParentSearchMinute,
  type ParentSearchMinExperience,
  type ParentSearchMinRating
} from "@/lib/sitter/parent-search-filters";
import {
  isParentSearchCalendarDateSelectable,
  isParentSearchHourSelectable,
  isParentSearchMinuteSelectable,
  parentSearchClockAfterDateChange,
  parentSearchEarliestSelectableDate,
  parentSearchEndDateMin
} from "@/lib/sitter/parent-search-datetime";
import {
  parentSearchFieldIsInvalid,
  type ParentSearchMandatoryField
} from "@/lib/sitter/parent-search-validation";
import { CityAutocomplete } from "@/components/geo/city-autocomplete";
import { ParentSearchDateField } from "@/components/parent/parent-search-date-field";
import {
  SEARCH_LIMIT_CLEAR_BUTTON,
  SEARCH_LIMIT_SLIDER_CLASS,
  SEARCH_LIMIT_SLIDER_ENDS,
  SEARCH_LIMIT_VALUE_BADGE,
  SEARCH_LIMIT_VALUE_ROW,
  SearchLimitToggleCard,
  searchLimitSliderProgress
} from "@/components/parent/search-limit-toggle-card";
import { PARENT_SEARCH_FAVORITES_ONLY_LABEL as FAVORITES_ONLY_LABEL } from "@/lib/favorites/parent-favorite-rules";
import { Award, Calendar, ChevronDown, Coins, Search, SlidersHorizontal, Star } from "lucide-react";
import { RequiredFieldMark } from "@/components/ui/required-field-mark";

const EXPERIENCE_OPTIONS: { value: ParentSearchMinExperience; label: string }[] = [
  { value: 0, label: "ללא הגבלה" },
  { value: 1, label: "שנה ומעלה" },
  { value: 3, label: "3 שנים ומעלה" },
  { value: 5, label: "5 שנים ומעלה" }
];

const FIELD_LABEL =
  "mb-1.5 block min-h-[1.5rem] text-right text-sm font-medium leading-snug text-[#001F3F]";
const SECTION_SURFACE =
  "overflow-visible rounded-3xl border border-slate-200/60 bg-white p-3 shadow-soft";
const PAIR_GRID = "grid min-w-0 grid-cols-2 items-start gap-2";
const FIELD_CONTROL =
  "box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-slate-200/80 bg-white px-3 text-base font-medium leading-none text-[#001F3F] transition placeholder:text-slate-400 focus:border-[#001F3F] focus:outline-none focus:ring-2 focus:ring-[#001F3F]/15 disabled:opacity-50 appearance-none";
const FIELD_CONTROL_INVALID =
  "box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-rose-400 bg-white px-3 text-base font-medium leading-none text-[#001F3F] ring-1 ring-rose-200 transition placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-50 appearance-none";
const DATE_CONTROL =
  "parent-search-date box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-slate-200/80 bg-white px-2.5 text-base font-medium text-[#001F3F] outline-none transition focus:border-[#001F3F] focus:ring-2 focus:ring-[#001F3F]/15 disabled:opacity-50";
const DATE_CONTROL_INVALID =
  "parent-search-date box-border block h-11 min-h-[44px] w-full max-w-full rounded-xl border border-rose-400 bg-white px-2.5 text-base font-medium text-[#001F3F] outline-none ring-1 ring-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-300 disabled:opacity-50";
const TIME_SELECT =
  "mt-1 box-border block h-11 min-h-[44px] w-full min-w-0 max-w-full rounded-xl border border-slate-200/80 bg-white px-1 text-base font-medium text-[#001F3F] outline-none transition focus:border-[#001F3F] focus:ring-2 focus:ring-[#001F3F]/15 disabled:opacity-50";
const TIME_SELECT_INVALID =
  "mt-1 box-border block h-11 min-h-[44px] w-full min-w-0 max-w-full rounded-xl border border-rose-400 bg-white px-1 text-base font-medium text-[#001F3F] outline-none ring-1 ring-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-300 disabled:opacity-50";
const PAIR_COL = "flex min-w-0 flex-col";

const VERIFIED_QUICK_FILTER_LABEL = "הצג רק בייביסיטריות עם זהות מאומתת";
const FAVORITES_QUICK_FILTER_HELP =
  "יוצגו רק בייביסיטריות שהוספתם לרשימת המועדפות שלכם.";

function SearchQuickFilterHelp({
  content,
  describedById
}: {
  content: string;
  describedById?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex shrink-0 translate-y-[-1px] align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="מידע נוסף"
        aria-expanded={open}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300/80 bg-white font-serif text-[9px] font-normal italic leading-none text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-500"
      >
        <span className="absolute -inset-2" aria-hidden />?
      </button>
      {describedById ? (
        <span id={describedById} className="sr-only">
          {content}
        </span>
      ) : null}
      {open ? (
        <span
          role="tooltip"
          dir="rtl"
          className="absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[70vw] rounded-lg border border-stone-700 bg-stone-900 p-3 text-right font-sans text-xs font-normal not-italic leading-relaxed text-stone-100 shadow-xl"
        >
          {content}
          <span className="absolute top-full left-3 border-4 border-transparent border-t-stone-900" />
        </span>
      ) : null}
    </span>
  );
}

function SearchQuickFilterRow({
  checked,
  label,
  help,
  onChange,
  headingId,
  hintId
}: {
  checked: boolean;
  label: string;
  help: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  headingId?: string;
  hintId?: string;
}) {
  return (
    <label
      dir="rtl"
      className="parent-search-check-row flex min-h-11 w-full cursor-pointer items-center gap-1.5 py-1 text-right text-[13px] font-semibold leading-none text-[#001F3F]"
    >
      <input
        type="checkbox"
        className="h-[18px] w-[18px] shrink-0 rounded border-slate-300 accent-[#001F3F]"
        checked={checked}
        aria-labelledby={headingId}
        aria-describedby={hintId}
        onChange={onChange}
      />
      <span id={headingId} className="min-w-0 whitespace-nowrap">
        {label}
      </span>
      <SearchQuickFilterHelp content={help} describedById={hintId} />
    </label>
  );
}

function FieldLabel({
  children,
  required = false,
  className = "",
  icon = null
}: {
  children: string;
  required?: boolean;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span className={`${FIELD_LABEL} ${className}`.trim()}>
      <span className="inline-flex items-center gap-1">
        {icon ? <span className="inline-flex shrink-0 text-slate-400">{icon}</span> : null}
        {required ? <RequiredFieldMark /> : null}
        <span className="leading-snug">{children}</span>
      </span>
    </span>
  );
}

function TimeBlock({
  title,
  calendarDate,
  now,
  hour,
  minute,
  disabled,
  invalid,
  required,
  onHourChange,
  onMinuteChange
}: {
  title: string;
  calendarDate: string;
  now: Date;
  hour: string;
  minute: ParentSearchMinute | "";
  disabled: boolean;
  invalid?: boolean;
  required?: boolean;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: ParentSearchMinute | "") => void;
}) {
  const selectClass = `${invalid ? TIME_SELECT_INVALID : TIME_SELECT} parent-search-time-select`;
  return (
    <div
      className={`parent-search-time-block flex h-full flex-col rounded-xl border p-1.5 ${
        invalid ? "border-rose-300 bg-rose-50/40" : "border-slate-100 bg-[#FDFBF6]"
      }`}
    >
      <FieldLabel required={required} className="parent-search-when-label">
        {title}
      </FieldLabel>
      {/* Fixed LTR order so hours stay left and minutes right inside RTL pages. */}
      <div className="grid grid-cols-2 gap-1" dir="ltr">
        <label className="parent-search-time-caption block min-w-0 text-right text-[13px] font-medium leading-none text-slate-500">
          <span className="mb-0 block leading-none">שעה</span>
          <select
            className={selectClass}
            value={hour}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(e) => onHourChange(e.target.value)}
          >
            <option value="">—</option>
            {PARENT_SEARCH_HOUR_OPTIONS.map((h) => {
              const hourDisabled =
                Boolean(calendarDate) && !isParentSearchHourSelectable(calendarDate, h, now);
              return (
                <option key={h} value={h} disabled={hourDisabled}>
                  {h}
                </option>
              );
            })}
          </select>
        </label>

        <label className="parent-search-time-caption block min-w-0 text-right text-[13px] font-medium leading-none text-slate-500">
          <span className="mb-0 block leading-none">דק׳</span>
          <select
            className={selectClass}
            value={minute}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(e) => onMinuteChange(e.target.value as ParentSearchMinute | "")}
          >
            <option value="">—</option>
            {PARENT_SEARCH_MINUTE_OPTIONS.map((m) => {
              const minuteDisabled =
                Boolean(calendarDate) &&
                Boolean(hour) &&
                !isParentSearchMinuteSelectable(calendarDate, hour, m, now);
              return (
                <option key={m} value={m} disabled={minuteDisabled}>
                  {m}
                </option>
              );
            })}
          </select>
        </label>
      </div>
    </div>
  );
}

const ID_PREFIXES = ["RAN", "AN", "CONS"] as const;
type IdPrefix = (typeof ID_PREFIXES)[number];

function parseSitterId(value: string): { prefix: IdPrefix; digits: string; raw: string | null } {
  const compact = value.trim().replace(/\s+/g, "");
  if (!compact) return { prefix: "RAN", digits: "", raw: null };
  const tagged = compact.match(/^(RAN|AN|CONS)[-_]?(\d*)$/i);
  if (tagged) {
    return { prefix: tagged[1].toUpperCase() as IdPrefix, digits: tagged[2], raw: null };
  }
  if (/^\d+$/.test(compact)) return { prefix: "AN", digits: compact, raw: null };
  return { prefix: "RAN", digits: "", raw: compact };
}

function commitSitterId(prefix: IdPrefix, digits: string): string {
  return digits ? `${prefix}-${digits}` : "";
}

function ParentSearchIdField({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseSitterId(value);
  const [prefix, setPrefix] = useState<IdPrefix>(parsed.prefix);

  useEffect(() => {
    if (parsed.digits || /^(RAN|AN|CONS)/i.test(value.trim())) {
      setPrefix(parsed.prefix);
    }
  }, [parsed.digits, parsed.prefix, value]);

  const applyTyped = (raw: string) => {
    const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (!compact) {
      onChange("");
      return;
    }
    const tagged = compact.match(/^(RAN|AN|CONS)[-_]?(\d*)$/);
    if (tagged) {
      const nextPrefix = tagged[1] as IdPrefix;
      setPrefix(nextPrefix);
      onChange(tagged[2] ? `${nextPrefix}-${tagged[2]}` : "");
      return;
    }
    if (/^\d+$/.test(compact)) {
      onChange(commitSitterId(prefix, compact));
      return;
    }
    onChange(compact);
  };

  return (
    <div className="parent-search-id flex h-11 min-h-[44px] w-full min-w-0 items-center gap-0.5 rounded-xl border border-slate-200/80 bg-white px-1.5">
      <label className="flex shrink-0 items-center text-[12px] font-semibold leading-none">
        <span className="sr-only">קידומת מזהה</span>
        <select
          aria-label="קידומת מזהה"
          className="w-12 appearance-none bg-transparent text-[12px] font-semibold text-[#001F3F] outline-none"
          value={prefix}
          onChange={(event) => {
            const nextPrefix = event.target.value as IdPrefix;
            setPrefix(nextPrefix);
            if (parsed.raw) return;
            onChange(commitSitterId(nextPrefix, parsed.digits));
          }}
        >
          {ID_PREFIXES.map((prefix) => (
            <option key={prefix} value={prefix}>
              {prefix}
            </option>
          ))}
        </select>
        <span aria-hidden="true">-</span>
      </label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        placeholder="1001"
        aria-label="מספר מזהה"
        className="min-w-0 flex-1 bg-transparent text-left text-[13px] font-medium text-[#001F3F] outline-none placeholder:font-normal placeholder:text-slate-400"
        value={parsed.raw ?? parsed.digits}
        onChange={(event) => applyTyped(event.target.value)}
      />
      <Search className="pointer-events-none h-4 w-4 shrink-0 text-slate-400" aria-hidden />
    </div>
  );
}

function ratingOptionText(value: string, label: string): string {
  if (value === "all") return label;
  const suffix = label.includes("ומעלה") ? " ומעלה" : "";
  return `\u2066⭐ ${value}\u2069${suffix}`;
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

  const [now, setNow] = useState(() => new Date());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedPanelId = useId();
  const advancedHeadingId = useId();
  const cityHeadingId = useId();

  useEffect(() => {
    const root = document.documentElement;
    const openForTour = () => {
      if (root.getAttribute("data-product-tour-step") === "verified-only") {
        setAdvancedOpen(true);
      }
    };
    openForTour();
    const observer = new MutationObserver(openForTour);
    observer.observe(root, { attributes: true, attributeFilter: ["data-product-tour-step"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const refresh = () => {
      const active = document.activeElement;
      if (active instanceof HTMLSelectElement) return;
      if (active instanceof HTMLElement && active.closest("[data-parent-search-date]")) return;
      setNow(new Date());
    };
    const id = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const todayIso = parentSearchEarliestSelectableDate(now);
  const endDateMin = parentSearchEndDateMin(filters.searchDate, now);

  const cityInvalid = parentSearchFieldIsInvalid(invalidFields, "selectedCity");
  const startDateInvalid = parentSearchFieldIsInvalid(invalidFields, "searchDate");
  const endDateInvalid = parentSearchFieldIsInvalid(invalidFields, "searchEndDate");
  const startTimeInvalid = parentSearchFieldIsInvalid(invalidFields, "searchStartTime");
  const endTimeInvalid = parentSearchFieldIsInvalid(invalidFields, "searchEndTime");

  const acceptHour = (
    day: string,
    hour: string,
    minute: string
  ): { hour: string; minute: ParentSearchMinute | "" } | null => {
    const at = new Date();
    setNow(at);
    if (hour && !isParentSearchHourSelectable(day, hour, at)) return null;
    const clock = parentSearchClockAfterDateChange(day, hour, minute, at);
    return { hour: clock.hour, minute: clock.minute as ParentSearchMinute | "" };
  };

  const acceptMinute = (day: string, hour: string, minute: string): ParentSearchMinute | "" | null => {
    const at = new Date();
    setNow(at);
    if (minute && !isParentSearchMinuteSelectable(day, hour, minute, at)) return null;
    return minute as ParentSearchMinute | "";
  };

  return (
    <section data-tour="parent-search-filters" className="flex flex-col gap-1.5" dir="rtl">
      <div className={`${SECTION_SURFACE} space-y-1 !p-2`}>
        <h2 id={cityHeadingId} className="text-base font-semibold leading-tight text-[#001F3F]">
          <span className="inline-flex items-center gap-1.5">
            <RequiredFieldMark />
            <span>עיר פעילות</span>
          </span>
        </h2>
        <CityAutocomplete
          value={filters.selectedCity}
          onChange={(selectedCity) => patch({ selectedCity })}
          invalid={cityInvalid}
          labelledBy={cityHeadingId}
          inputClassName={`${cityInvalid ? FIELD_CONTROL_INVALID : FIELD_CONTROL} pr-9 pl-10`}
        />
      </div>

      <div className={`${SECTION_SURFACE} parent-search-when space-y-1 !p-2`}>
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Calendar className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold leading-snug text-[#001F3F]">מתי העבודה נדרשת?</h2>
        </div>

        <div className="parent-search-when-grid grid grid-cols-2 items-start gap-1">
          <div className={`${PAIR_COL} gap-1`}>
            <FieldLabel required className="parent-search-when-label">
              תאריך התחלה
            </FieldLabel>
            <ParentSearchDateField
              className={startDateInvalid ? DATE_CONTROL_INVALID : DATE_CONTROL}
              min={todayIso}
              now={now}
              align="start"
              invalid={startDateInvalid}
              value={filters.searchDate}
              onChange={(searchDate) => {
                const at = new Date();
                setNow(at);
                if (!searchDate) {
                  patch({ searchDate: "", ...clearTimes });
                  return;
                }
                if (!isParentSearchCalendarDateSelectable(searchDate, at)) return;
                const searchEndDate =
                  !filters.searchEndDate || filters.searchEndDate === filters.searchDate
                    ? searchDate
                    : filters.searchEndDate;
                const startClock = parentSearchClockAfterDateChange(
                  searchDate,
                  filters.searchStartHour ?? "",
                  filters.searchStartMinute ?? "",
                  at
                );
                const endClock = parentSearchClockAfterDateChange(
                  searchEndDate,
                  filters.searchEndHour ?? "",
                  filters.searchEndMinute ?? "",
                  at
                );
                patch({
                  searchDate,
                  searchEndDate,
                  searchStartHour: startClock.hour,
                  searchStartMinute: startClock.minute as ParentSearchMinute | "",
                  searchEndHour: endClock.hour,
                  searchEndMinute: endClock.minute as ParentSearchMinute | ""
                });
              }}
            />
            <TimeBlock
              title="שעת התחלה"
              required
              calendarDate={filters.searchDate}
              now={now}
              hour={filters.searchStartHour ?? ""}
              minute={filters.searchStartMinute ?? ""}
              disabled={!filters.searchDate}
              invalid={startTimeInvalid}
              onHourChange={(searchStartHour) => {
                const clock = acceptHour(
                  filters.searchDate,
                  searchStartHour,
                  filters.searchStartMinute ?? ""
                );
                if (!clock) return;
                patch({ searchStartHour: clock.hour, searchStartMinute: clock.minute });
              }}
              onMinuteChange={(searchStartMinute) => {
                const next = acceptMinute(
                  filters.searchDate,
                  filters.searchStartHour ?? "",
                  searchStartMinute
                );
                if (next === null) return;
                patch({ searchStartMinute: next });
              }}
            />
          </div>

          <div className={`${PAIR_COL} gap-1`}>
            <FieldLabel required className="parent-search-when-label">
              תאריך סיום
            </FieldLabel>
            <ParentSearchDateField
              className={endDateInvalid ? DATE_CONTROL_INVALID : DATE_CONTROL}
              min={endDateMin}
              now={now}
              align="end"
              disabled={!filters.searchDate}
              invalid={endDateInvalid}
              value={filters.searchEndDate}
              onChange={(searchEndDate) => {
                const at = new Date();
                setNow(at);
                if (!searchEndDate) {
                  patch({ searchEndDate: "" });
                  return;
                }
                if (!isParentSearchCalendarDateSelectable(searchEndDate, at)) return;
                const endClock = parentSearchClockAfterDateChange(
                  searchEndDate,
                  filters.searchEndHour ?? "",
                  filters.searchEndMinute ?? "",
                  at
                );
                patch({
                  searchEndDate,
                  searchEndHour: endClock.hour,
                  searchEndMinute: endClock.minute as ParentSearchMinute | ""
                });
              }}
            />
            <TimeBlock
              title="שעת סיום"
            required
            calendarDate={filters.searchEndDate}
            now={now}
            hour={filters.searchEndHour ?? ""}
            minute={filters.searchEndMinute ?? ""}
            disabled={!filters.searchDate}
            invalid={endTimeInvalid}
            onHourChange={(searchEndHour) => {
              const clock = acceptHour(
                filters.searchEndDate,
                searchEndHour,
                filters.searchEndMinute ?? ""
              );
              if (!clock) return;
              patch({ searchEndHour: clock.hour, searchEndMinute: clock.minute });
            }}
            onMinuteChange={(searchEndMinute) => {
              const next = acceptMinute(
                filters.searchEndDate,
                filters.searchEndHour ?? "",
                searchEndMinute
              );
              if (next === null) return;
              patch({ searchEndMinute: next });
            }}
          />
          </div>
        </div>
      </div>

      <div className="overflow-visible rounded-3xl shadow-soft">
        <button
          type="button"
          className={`flex w-full items-center gap-2 border border-[#D5E8D0] bg-[#E6F4E2] px-3 py-1.5 text-right transition hover:bg-[#DDF0D8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F]/25 ${
            advancedOpen ? "rounded-t-3xl" : "rounded-3xl"
          }`}
          aria-expanded={advancedOpen}
          aria-controls={advancedPanelId}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/80 text-emerald-700">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </span>
          <span id={advancedHeadingId} className="min-w-0 flex-1 whitespace-nowrap text-sm font-semibold leading-none text-[#001F3F]">
            תנאי חיפוש נוספים
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-emerald-800 transition-transform duration-200 ${
              advancedOpen ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>

        <div
          id={advancedPanelId}
          role="region"
          aria-labelledby={advancedHeadingId}
          hidden={!advancedOpen}
          className="space-y-3 overflow-visible rounded-b-3xl border border-t-0 border-[#D5E8D0] bg-white px-2.5 py-2.5"
        >
          <div className="divide-y divide-slate-100">
            <div data-tour="verified-only" data-product-label={PARENT_SEARCH_VERIFIED_ONLY_LABEL}>
              <SearchQuickFilterRow
                headingId="verified-only-heading"
                hintId="verified-only-hint"
                checked={Boolean(filters.verifiedOnly)}
                label={VERIFIED_QUICK_FILTER_LABEL}
                help={PARENT_SEARCH_VERIFIED_ONLY_HINT}
                onChange={(e) => patch({ verifiedOnly: e.target.checked })}
              />
            </div>
            <div data-product-label={FAVORITES_ONLY_LABEL}>
              <SearchQuickFilterRow
                checked={Boolean(filters.favoritesOnly)}
                label="הצג רק מועדפות שלי"
                help={FAVORITES_QUICK_FILTER_HELP}
                onChange={(e) => patch({ favoritesOnly: e.target.checked })}
              />
            </div>
          </div>

          <div className={PAIR_GRID}>
            <div className={PAIR_COL}>
              <FieldLabel className="parent-search-pair-label" icon={<Award className="h-3.5 w-3.5" />}>
                שנות ניסיון
              </FieldLabel>
              <select
                className={`${FIELD_CONTROL} px-2 text-sm`}
                value={String(filters.minYearsExperience)}
                onChange={(e) => patch({ minYearsExperience: Number(e.target.value) as ParentSearchMinExperience })}
              >
                {EXPERIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className={PAIR_COL}>
              <FieldLabel className="parent-search-pair-label" icon={<Star className="h-3.5 w-3.5" />}>
                דירוג מינימלי
              </FieldLabel>
              <select
                className={`${FIELD_CONTROL} px-2 text-sm`}
                value={filters.minRating ?? "all"}
                onChange={(e) => patch({ minRating: e.target.value as ParentSearchMinRating })}
              >
                {PARENT_SEARCH_RATING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {ratingOptionText(o.value, o.label)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={PAIR_GRID}>
            <SearchLimitToggleCard
              embedded
              title="מחיר שעתי מקסימלי"
              icon={<Coins className="h-3.5 w-3.5" />}
              toggleLabel="הגבל מחיר"
              enabled={filters.maxHourlyRate != null}
              onEnabledChange={(enabled) =>
                patch({
                  maxHourlyRate: enabled ? PARENT_SEARCH_MAX_HOURLY_SLIDER : null
                })
              }
              inactiveHint="ללא הגבלת מחיר"
            >
              <div className={`${SEARCH_LIMIT_VALUE_ROW} mt-2 flex-wrap`}>
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

            <div className={PAIR_COL}>
              <FieldLabel className="parent-search-pair-label">חיפוש לפי ה-ID</FieldLabel>
              <ParentSearchIdField
                value={filters.searchSitterSerial}
                onChange={(searchSitterSerial) => patch({ searchSitterSerial })}
              />
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}