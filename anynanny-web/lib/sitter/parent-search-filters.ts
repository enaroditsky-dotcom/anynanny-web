import { isIsraelCity, type IsraelCity } from "@/lib/geo/israel-cities";

export type ParentSearchTransportFilter = "all" | "self" | "taxi";

export type ParentSearchMinExperience = 0 | 1 | 3 | 5;

/** Canonical service types sent to `list_public_sitters_search.p_service_type`. */
export type ParentSearchServiceType =
  | "babysitter"
  | "sleep_consultant"
  | "lactation_consultant"
  | "doula";

/** UI / URL role aliases used by `/parent/search`. */
export type ParentSearchServiceRoleAlias =
  | "sitter"
  | "lactation"
  | "sleep"
  | "doula"
  | ParentSearchServiceType;

/** Minimum average sitter rating; `all` sends no `p_min_rating` filter. */
export const PARENT_SEARCH_MIN_RATING_VALUES = ["all", "3", "4", "4.5", "5"] as const;
export type ParentSearchMinRating = (typeof PARENT_SEARCH_MIN_RATING_VALUES)[number];

export const PARENT_SEARCH_RATING_OPTIONS: { value: ParentSearchMinRating; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "3", label: "⭐ 3 ומעלה" },
  { value: "4", label: "⭐ 4 ומעלה" },
  { value: "4.5", label: "⭐ 4.5 ומעלה" },
  { value: "5", label: "⭐ 5" }
];

const LEGACY_MIN_RATING_ALIASES: Record<string, ParentSearchMinRating> = {
  "3.0": "3",
  "4.0": "4",
  "5.0": "5"
};

/** Parse URL / form rating values into the canonical dropdown set. */
export function parseParentSearchMinRating(raw: string | null | undefined): ParentSearchMinRating {
  const value = String(raw ?? "").trim();
  if ((PARENT_SEARCH_MIN_RATING_VALUES as readonly string[]).includes(value)) {
    return value as ParentSearchMinRating;
  }
  return LEGACY_MIN_RATING_ALIASES[value] ?? "all";
}

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
  /** Public serial on `sitter_profiles.nanny_serial` (e.g. AN-1001 / CONS-1001). */
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
  /**
   * Max hourly rate (NIS). `null` = no price restriction.
   * When set, filters sitters with `hourly_rate_nis <= maxHourlyRate`.
   */
  maxHourlyRate: number | null;
  /** Canonical city from `ISRAEL_CITIES` — filters `sitter_profiles.working_cities`. */
  selectedCity: IsraelCity | "";
  /** Selected parent search service (`babysitter` | `sleep_consultant` | `lactation_consultant`). */
  serviceType: ParentSearchServiceType;
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
  maxHourlyRate: null,
  selectedCity: "",
  serviceType: "babysitter"
});

/** Map UI / URL role aliases to the RPC `p_service_type` value. */
export function normalizeParentSearchServiceType(
  raw: string | null | undefined
): ParentSearchServiceType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "doula") return "doula";
  if (value === "sleep" || value === "sleep_consultant") return "sleep_consultant";
  if (value === "lactation" || value === "lactation_consultant") return "lactation_consultant";
  return "babysitter";
}

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
    minRating: parseParentSearchMinRating(partial.minRating ?? base.minRating),
    transport: partial.transport ?? base.transport,
    maxHourlyRate: (() => {
      if (partial.maxHourlyRate === null) return null;
      if (partial.maxHourlyRate === undefined) return base.maxHourlyRate;
      const n = Number(partial.maxHourlyRate);
      if (!Number.isFinite(n) || n < 0) return null;
      return n;
    })(),
    selectedCity:
      partial.selectedCity != null && isIsraelCity(String(partial.selectedCity))
        ? partial.selectedCity
        : base.selectedCity,
    serviceType: normalizeParentSearchServiceType(
      (partial as { serviceType?: string; roleType?: string }).serviceType ??
        (partial as { roleType?: string }).roleType ??
        base.serviceType
    )
  };
}

export function minRatingToRpcValue(minRating: ParentSearchMinRating): number | null {
  if (minRating === "all") return null;
  const n = Number(minRating);
  return Number.isFinite(n) ? n : null;
}

/** RPC `p_min_years_experience` — accepts numeric state or Hebrew labels like `3+ שנים`. */
export function minYearsExperienceToRpcValue(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const text = String(raw).trim();
  if (!text || text === "all" || text.includes("הכל")) return 0;
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/** Normalize parent input to canonical serial form (`AN-1004` / `CONS-1001`). */
export function normalizeSitterSerialForLookup(raw: string | null | undefined): string | null {
  const compact = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!compact) return null;
  if (/^CONS-\d+$/.test(compact)) return compact;
  if (/^CONS_\d+$/.test(compact)) return `CONS-${compact.slice(5)}`;
  if (/^AN-\d+$/.test(compact)) return compact;
  if (/^AN_\d+$/.test(compact)) return `AN-${compact.slice(3)}`;
  if (/^\d+$/.test(compact)) return `AN-${compact}`;
  return compact;
}

/** True when input is a complete public serial (e.g. AN-1004 / CONS-1001). */
export function isExactSitterSerialQuery(raw: string | null | undefined): boolean {
  const norm = normalizeSitterSerialForLookup(raw);
  return norm != null && /^(AN|CONS)-\d+$/.test(norm);
}

/** Exact serial lookup still bypasses city/rating/price/transport. Time windows are always sent. */
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
  /** `null` = no max-rate filter. */
  p_max_hourly_rate: number | null;
  p_search_city: string | null;
  p_service_type: ParentSearchServiceType;
};

/** RPC args for `list_public_sitters_search`. */
export function toListPublicSittersSearchRpcArgs(
  filters: ParentSearchFilters
): ListPublicSittersSearchRpcParams {
  const safe = normalizeParentSearchFilters(filters);
  const serialOnly = shouldUseDirectSerialLookup(safe.searchSitterSerial);

  return {
    p_search_nanny_id: sitterSerialToRpcParam(safe.searchSitterSerial),
    p_start_time: buildSearchStartTimeIso(safe),
    p_end_time: buildSearchEndTimeIso(safe),
    p_min_years_experience: serialOnly ? 0 : minYearsExperienceToRpcValue(safe.minYearsExperience),
    p_min_rating: serialOnly ? null : minRatingToRpcValue(safe.minRating),
    p_transport: serialOnly ? "all" : safe.transport,
    p_max_hourly_rate: serialOnly ? null : safe.maxHourlyRate,
    p_search_city: serialOnly || !safe.selectedCity ? null : safe.selectedCity,
    p_service_type: safe.serviceType
  };
}

function parseClockParam(raw: string | null): { hour: string; minute: string } {
  const value = (raw ?? "").trim();
  if (!value) return { hour: "", minute: "" };

  if (value.includes(":")) {
    const [hourPart, minutePart = ""] = value.split(":");
    return {
      hour: hourPart.trim().padStart(2, "0"),
      minute: minutePart.trim().padStart(2, "0")
    };
  }

  return { hour: value.padStart(2, "0"), minute: "" };
}

function readSearchParam(params: Pick<URLSearchParams, "get">, keys: string[]): string {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null && value.trim() !== "") return value.trim();
  }
  return "";
}

/** Parse `/parent/search/results` (and forwarded sitter-profile) query params into filters. */
export function parseFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): ParentSearchFilters {
  const startClock = parseClockParam(
    readSearchParam(params, ["startTime", "searchStartTime"]) ||
      (readSearchParam(params, ["searchStartHour"])
        ? `${readSearchParam(params, ["searchStartHour"])}:${readSearchParam(params, ["searchStartMinute"]) || "00"}`
        : "")
  );
  const endClock = parseClockParam(
    readSearchParam(params, ["endTime", "searchEndTime"]) ||
      (readSearchParam(params, ["searchEndHour"])
        ? `${readSearchParam(params, ["searchEndHour"])}:${readSearchParam(params, ["searchEndMinute"]) || "00"}`
        : "")
  );

  const minYearsRaw = readSearchParam(params, ["minYearsExperience", "experience"]);
  const minYearsParsed = minYearsRaw ? Number(minYearsRaw) : 0;
  const minYearsExperience = ([0, 1, 3, 5] as const).includes(minYearsParsed as ParentSearchMinExperience)
    ? (minYearsParsed as ParentSearchMinExperience)
    : 0;

  const minRating = parseParentSearchMinRating(readSearchParam(params, ["minRating", "rating"]));

  const transportRaw = readSearchParam(params, ["transport"]) as ParentSearchTransportFilter;
  const transport = (["all", "self", "taxi"] as const).includes(transportRaw) ? transportRaw : "all";

  const maxHourlyRaw = readSearchParam(params, ["maxHourlyRate", "maxRate"]);
  const maxHourlyParsed = maxHourlyRaw ? Number(maxHourlyRaw) : null;
  const maxHourlyRate =
    maxHourlyParsed != null && Number.isFinite(maxHourlyParsed) && maxHourlyParsed >= 0
      ? maxHourlyParsed
      : null;

  return normalizeParentSearchFilters({
    searchSitterSerial: readSearchParam(params, ["searchSitterSerial", "serial", "searchNannyId"]),
    searchDate: readSearchParam(params, ["date", "searchDate"]),
    searchEndDate: readSearchParam(params, ["endDate", "searchEndDate"]),
    searchStartHour: startClock.hour,
    searchStartMinute: startClock.minute,
    searchEndHour: endClock.hour,
    searchEndMinute: endClock.minute,
    minYearsExperience,
    minRating,
    transport,
    maxHourlyRate,
    selectedCity: readSearchParam(params, ["city", "selectedCity"]) as ParentSearchFilters["selectedCity"],
    serviceType: normalizeParentSearchServiceType(
      readSearchParam(params, ["serviceType", "roleType", "p_service_type"])
    )
  });
}

/** Serialize parent search filters to the canonical results-page query params. */
export function parentSearchFiltersToUrlSearchParams(filters: ParentSearchFilters): URLSearchParams {
  const safe = normalizeParentSearchFilters(filters);
  const params = new URLSearchParams();

  params.set("roleType", "sitter");
  params.set("serviceType", "babysitter");

  const serial = safe.searchSitterSerial.trim();
  if (serial) params.set("serial", serial);

  if (safe.selectedCity) params.set("city", safe.selectedCity);
  if (safe.searchDate) params.set("date", safe.searchDate);
  if (safe.searchEndDate) params.set("endDate", safe.searchEndDate);

  if (safe.searchStartHour.trim()) {
    const hour = safe.searchStartHour.padStart(2, "0");
    const minute = (safe.searchStartMinute || "00").padStart(2, "0");
    params.set("startTime", `${hour}:${minute}`);
  }

  if (safe.searchEndHour.trim()) {
    const hour = safe.searchEndHour.padStart(2, "0");
    const minute = (safe.searchEndMinute || "00").padStart(2, "0");
    params.set("endTime", `${hour}:${minute}`);
  }

  if (safe.minYearsExperience > 0) {
    params.set("minYearsExperience", String(safe.minYearsExperience));
  }

  if (safe.minRating !== "all") {
    params.set("minRating", safe.minRating);
  }

  if (safe.maxHourlyRate != null) {
    params.set("maxHourlyRate", String(safe.maxHourlyRate));
  }

  return params;
}

export function parentSearchResultsPath(filters: ParentSearchFilters): string {
  const query = parentSearchFiltersToUrlSearchParams(filters).toString();
  return query ? `/parent/search/results?${query}` : "/parent/search/results";
}

/**
 * True when the parent explicitly chose a start date plus start and end clocks.
 * Incomplete search windows (date-only, or missing minutes) are not a bookable shift context.
 */
export function hasExplicitRequestedShiftFields(filters: ParentSearchFilters): boolean {
  const safe = normalizeParentSearchFilters(filters);
  return (
    Boolean(safe.searchDate.trim()) &&
    Boolean(safe.searchEndDate.trim()) &&
    Boolean(safe.searchStartHour.trim()) &&
    Boolean(safe.searchStartMinute.trim()) &&
    Boolean(safe.searchEndHour.trim()) &&
    Boolean(safe.searchEndMinute.trim())
  );
}
