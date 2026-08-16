import {
  requestedShiftFromFilters,
  validateRequestedShiftWindow,
  type RequestedShiftWindow
} from "@/lib/bookings/requested-shift";
import {
  normalizeParentSearchFilters,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";

export const PARENT_SEARCH_MISSING_CRITERIA_MESSAGE =
  "יש למלא עיר, תאריך ושעות כדי לחפש בייביסיטר פנויה.";

export const PARENT_SEARCH_MISSING_SHIFT_MESSAGE =
  "יש למלא תאריך ושעות כדי לחפש בייביסיטר פנויה.";

export type ParentSearchMandatoryField =
  | "selectedCity"
  | "searchDate"
  | "searchEndDate"
  | "searchStartTime"
  | "searchEndTime";

export type ParentSearchCriteriaResult =
  | {
      ok: true;
      filters: ParentSearchFilters;
      shift: RequestedShiftWindow;
    }
  | {
      ok: false;
      error: string;
      missing: ParentSearchMandatoryField[];
    };

function hasClock(hour: string, minute: string): boolean {
  return Boolean(hour.trim()) && Boolean(minute.trim());
}

/**
 * Gate for parent search: city + complete requested shift window are required
 * before any availability/search backend call.
 *
 * Serial lookup remains optional and still bypasses city matching
 * for *who* is returned — but it cannot skip this booking-context gate.
 */
export function validateParentSearchCriteria(
  filters: ParentSearchFilters
): ParentSearchCriteriaResult {
  const safe = normalizeParentSearchFilters(filters);
  const missing: ParentSearchMandatoryField[] = [];

  if (!safe.selectedCity.trim()) missing.push("selectedCity");
  if (!safe.searchDate.trim()) missing.push("searchDate");
  if (!safe.searchEndDate.trim()) missing.push("searchEndDate");
  if (!hasClock(safe.searchStartHour, safe.searchStartMinute)) {
    missing.push("searchStartTime");
  }
  if (!hasClock(safe.searchEndHour, safe.searchEndMinute)) {
    missing.push("searchEndTime");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: missing.includes("selectedCity")
        ? PARENT_SEARCH_MISSING_CRITERIA_MESSAGE
        : PARENT_SEARCH_MISSING_SHIFT_MESSAGE,
      missing
    };
  }

  const shift = requestedShiftFromFilters(safe);
  if (!shift) {
    return {
      ok: false,
      error: PARENT_SEARCH_MISSING_SHIFT_MESSAGE,
      missing: ["searchDate", "searchEndDate", "searchStartTime", "searchEndTime"]
    };
  }

  const validated = validateRequestedShiftWindow(shift);
  if ("error" in validated) {
    return {
      ok: false,
      error: validated.error,
      missing: ["searchDate", "searchEndDate", "searchStartTime", "searchEndTime"]
    };
  }

  return { ok: true, filters: safe, shift };
}

export function parentSearchFieldIsInvalid(
  missing: readonly ParentSearchMandatoryField[] | undefined,
  field: ParentSearchMandatoryField
): boolean {
  return Boolean(missing?.includes(field));
}
