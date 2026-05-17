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

/** Quarter-hour steps for minute picker. */
export const PARENT_SEARCH_MINUTE_OPTIONS = ["00", "15", "30", "45"] as const;

export type ParentSearchMinute = (typeof PARENT_SEARCH_MINUTE_OPTIONS)[number];

export type ParentSearchFilters = {
  searchNannyId: string;
  /** `YYYY-MM-DD` from `<input type="date">` */
  searchDate: string;
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
};

export const defaultParentSearchFilters = (): ParentSearchFilters => ({
  searchNannyId: "",
  searchDate: "",
  searchStartHour: "",
  searchStartMinute: "",
  searchEndHour: "",
  searchEndMinute: "",
  minYearsExperience: 0,
  minRating: "all",
  transport: "all",
  maxHourlyRate: PARENT_SEARCH_MAX_HOURLY_SLIDER
});

/** Merge partial / legacy filter state (e.g. old single `searchHour` field). */
export function normalizeParentSearchFilters(
  partial?: Partial<ParentSearchFilters> & {
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
    searchNannyId: partial.searchNannyId ?? base.searchNannyId,
    searchDate: partial.searchDate ?? base.searchDate,
    searchStartHour: partial.searchStartHour ?? legacyHour ?? base.searchStartHour,
    searchStartMinute: partial.searchStartMinute ?? legacyMinute ?? base.searchStartMinute,
    searchEndHour: partial.searchEndHour ?? base.searchEndHour,
    searchEndMinute: partial.searchEndMinute ?? base.searchEndMinute,
    minYearsExperience: partial.minYearsExperience ?? base.minYearsExperience,
    minRating: partial.minRating ?? base.minRating,
    transport: partial.transport ?? base.transport,
    maxHourlyRate: partial.maxHourlyRate ?? base.maxHourlyRate
  };
}

export function minRatingToRpcValue(minRating: ParentSearchMinRating): number | null {
  if (minRating === "all") return null;
  return Number(minRating);
}

/**
 * Maps nanny serial input to `p_search_nanny_id` for `list_public_sitters_search`.
 * Blank / whitespace → `null` (Postgres treats `null` and `''` as no nanny filter).
 */
export function searchNannyIdToRpcParam(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

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

/** Combine local date + 24h end time into ISO for `p_end_time`. */
export function buildSearchEndTimeIso(filters: ParentSearchFilters): string | null {
  const safe = normalizeParentSearchFilters(filters);
  const day = (safe.searchDate || "").trim();
  if (!day) return null;
  return buildLocalDateTimeIso(day, safe.searchEndHour, safe.searchEndMinute, { hour: "23", minute: "45" });
}

/** True when both timestamps exist and end is not after start. */
export function isInvalidParentSearchTimeRange(startIso: string | null, endIso: string | null): boolean {
  if (!startIso || !endIso) return false;
  return new Date(endIso).getTime() <= new Date(startIso).getTime();
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
};

/** RPC args for `list_public_sitters_search`. */
export function toListPublicSittersSearchRpcArgs(filters: ParentSearchFilters): ListPublicSittersSearchRpcParams {
  const safe = normalizeParentSearchFilters(filters);

  return {
    p_search_nanny_id: searchNannyIdToRpcParam(safe.searchNannyId),
    p_start_time: buildSearchStartTimeIso(safe),
    p_end_time: buildSearchEndTimeIso(safe),
    p_min_years_experience: safe.minYearsExperience,
    p_min_rating: minRatingToRpcValue(safe.minRating),
    p_transport: safe.transport,
    p_max_hourly_rate: safe.maxHourlyRate
  };
}
