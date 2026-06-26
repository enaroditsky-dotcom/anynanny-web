import { isIsraelCity, type IsraelCity } from "@/lib/geo/israel-cities";

export type ParentSearchTransportFilter = "all" | "self" | "taxi";

export type ParentSearchMinExperience = 0 | 1 | 3 | 5;

/** Minimum average sitter rating; `all` sends no `p_min_rating` filter. */
export type ParentSearchMinRating = "all" | "4.5" | "4.0" | "3.5";

export const PARENT_SEARCH_RATING_OPTIONS: { value: ParentSearchMinRating; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "4.5", label: "⭐ 4.5 ומעלה" },
  { value: "4.0", label: "⭐ 4.0 ומעלה" },
  { value: "3.5", label: "⭐ 3.5 ומעלה" }
];

export const PARENT_SEARCH_MAX_HOURLY_SLIDER = 150;

/** 24-hour clock hours for parent search time filter. */
export const PARENT_SEARCH_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) =>
  String(h).padStart(2, "0")
) as readonly string[];

/** Full minute range 00–59 for parent search time filters. */
export const PARENT_SEARCH_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) =>
  String(m).padStart(2, "0")
);

/** Two-digit minute string (`00`–`59`). */
export type ParentSearchMinute = string;

export type ParentSearchFilters = {
  /** Public serial on `sitter_profiles.nanny_serial` (e.g. AN-1001). */
  searchSitterSerial: string;
  /** `YYYY-MM-DD` — shift/booking start date */
  searchDate: string;
  /** `YYYY-MM-DD` — shift/booking end date (overnight); defaults to start when empty */
  searchEndDate: string;
  /** `00`–`23` (24-hour) — required window start */
  searchStartHour: string;
  searchStartMinute: ParentSearchMinute | "";
  /** `00`–`23` (24-hour) — required window end */
  searchEndHour: string;
  searchEndMinute: ParentSearchMinute | "";
  minYearsExperience: ParentSearchMinExperience;
  minRating: ParentSearchMinRating;
  transport: ParentSearchTransportFilter;
  maxHourlyRate: number;
  /** Canonical city from `ISRAEL_CITIES` — filters `sitter_profiles.working_cities`. */
  selectedCity: IsraelCity | "";
};

export const defaultParentSearchFilters = (): ParentSearchFilters => ({
  searchSitterSerial: "",
  searchDate: "",
  searchEndDate: "",
  searchStartHour: "",
  searchStartMinute: "",
  searchEndHour: "",
  searchEndMinute: "",
  minYearsExperience: 0,
  minRating: "all",
  transport: "all",
  maxHourlyRate: PARENT_SEARCH_MAX_HOURLY_SLIDER,
  selectedCity: ""
});

/** Merge partial / legacy filter state (e.g. old single `searchHour` field). */
export function normalizeParentSearchFilters(
  partial?: Partial<ParentSearchFilters> & {
    searchNannyId?: string;
    searchHour?: string;
    searchMinute?: ParentSearchMinute | "";
  } | null
): ParentSearchFilters {
  const base = defaultParentSearchFilters();
  if (!partial) return base;

  const legacyHour = partial.searchHour;
  const legacyMinute = partial.searchMinute;

  return {
    ...base,
    ...partial,
    searchSitterSerial:
      partial.searchSitterSerial ?? partial.searchNannyId ?? base.searchSitterSerial,
    searchDate: partial.searchDate ?? base.searchDate,
    searchEndDate: partial.searchEndDate ?? base.searchEndDate,
    searchStartHour: partial.searchStartHour ?? legacyHour ?? base.searchStartHour,
    searchStartMinute: partial.searchStartMinute ?? legacyMinute ?? base.searchStartMinute,
    searchEndHour: partial.searchEndHour ?? base.searchEndHour,
    searchEndMinute: partial.searchEndMinute ?? base.searchEndMinute,
    minYearsExperience: partial.minYearsExperience ?? base.minYearsExperience,
    minRating: partial.minRating ?? base.minRating,
    transport: partial.transport ?? base.transport,
    maxHourlyRate: partial.maxHourlyRate ?? base.maxHourlyRate,
    selectedCity:
      partial.selectedCity != null && isIsraelCity(String(partial.selectedCity))
        ? partial.selectedCity
        : base.selectedCity
  };
}

export function minRatingToRpcValue(minRating: ParentSearchMinRating): number | null {
  if (minRating === "all") return null;
  return Number(minRating);
}

/** RPC `p_min_years_experience` — accepts numeric state or Hebrew labels like `3+ שנים`. */
export function minYearsExperienceToRpcValue(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const text = String(raw).trim();
  if (!text || text === "all" || text.includes("הכל")) return 0;
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/** Normalize parent input to canonical serial form (e.g. `1004` → `AN-1004`). */
export function normalizeSitterSerialForLookup(raw: string | null | undefined): string | null {
  const compact = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!compact) return null;
  if (/^AN-\d+$/.test(compact)) return compact;
  if (/^\d+$/.test(compact)) return `AN-${compact}`;
  return compact;
}

/** True when input is a complete public serial (e.g. AN-1004). */
export function isExactSitterSerialQuery(raw: string | null | undefined): boolean {
  const norm = normalizeSitterSerialForLookup(raw);
  return norm != null && /^AN-\d+$/.test(norm);
}

/** Direct serial lookup — bypass calendar / availability RPC filters. */
export function shouldUseDirectSerialLookup(raw: string | null | undefined): boolean {
  return isExactSitterSerialQuery(raw);
}

/** @alias shouldUseDirectSerialLookup — used when building RPC args from full filter state. */
export function isSerialTargetedSearch(filters: ParentSearchFilters): boolean {
  return shouldUseDirectSerialLookup(filters.searchSitterSerial);
}

/**
 * Maps sitter serial input to `p_search_nanny_id` for `list_public_sitters_search`
 * (filters `sitter_profiles.nanny_serial` inside the RPC).
 */
export function sitterSerialToRpcParam(raw: string | null | undefined): string | null {
  return normalizeSitterSerialForLookup(raw);
}

/** @deprecated Use sitterSerialToRpcParam */
export const searchNannyIdToRpcParam = sitterSerialToRpcParam;

function buildLocalDateTimeIso(
  day: string,
  hourRaw: string,
  minuteRaw: string,
  defaults: { hour: string; minute: string }
): string | null {
  const trimmedDay = day.trim();
  if (!trimmedDay || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDay)) return null;

  const hour = (hourRaw.trim() !== "" ? hourRaw : defaults.hour).padStart(2, "0");
  const minute = (minuteRaw.trim() !== "" ? minuteRaw : defaults.minute).padStart(2, "0");

  const [y, mo, d] = trimmedDay.split("-").map((x) => Number(x));
  const h = Number(hour);
  const min = Number(minute);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;

  const local = new Date(y, mo - 1, d, h, min, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

/** Combine local date + 24h start time into ISO for `p_start_time`. */
export function buildSearchStartTimeIso(filters: ParentSearchFilters): string | null {
  const safe = normalizeParentSearchFilters(filters);
  const day = (safe.searchDate || "").trim();
  if (!day) return null;
  return buildLocalDateTimeIso(day, safe.searchStartHour, safe.searchStartMinute, { hour: "00", minute: "00" });
}

/** Combine local end date + 24h end time into ISO for `p_end_time`. */
export function buildSearchEndTimeIso(filters: ParentSearchFilters): string | null {
  const safe = normalizeParentSearchFilters(filters);
  const day = (safe.searchEndDate || safe.searchDate || "").trim();
  if (!day) return null;
  return buildLocalDateTimeIso(day, safe.searchEndHour, safe.searchEndMinute, { hour: "23", minute: "45" });
}

/** Exact PostgREST payload for `list_public_sitters_search` (no `p_search_date`). */
export type ListPublicSittersSearchRpcParams = {
  p_search_nanny_id: string | null;
  p_start_time: string | null;
  p_end_time: string | null;
  p_min_years_experience: number;
  p_min_rating: number | null;
  p_transport: string;
  p_max_hourly_rate: number;
  p_search_city: string | null;
};

/** RPC args for `list_public_sitters_search`. */
export function toListPublicSittersSearchRpcArgs(filters: ParentSearchFilters): ListPublicSittersSearchRpcParams {
  const safe = normalizeParentSearchFilters(filters);
  const serialOnly = shouldUseDirectSerialLookup(safe.searchSitterSerial);

  return {
    p_search_nanny_id: sitterSerialToRpcParam(safe.searchSitterSerial),
    p_start_time: serialOnly ? null : buildSearchStartTimeIso(safe),
    p_end_time: serialOnly ? null : buildSearchEndTimeIso(safe),
    p_min_years_experience: serialOnly ? 0 : minYearsExperienceToRpcValue(safe.minYearsExperience),
    p_min_rating: serialOnly ? null : minRatingToRpcValue(safe.minRating),
    p_transport: serialOnly ? "all" : safe.transport,
    p_max_hourly_rate: serialOnly ? PARENT_SEARCH_MAX_HOURLY_SLIDER : safe.maxHourlyRate,
    p_search_city: serialOnly || !safe.selectedCity ? null : safe.selectedCity
  };
}
