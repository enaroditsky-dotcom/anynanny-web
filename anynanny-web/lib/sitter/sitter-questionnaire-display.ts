import { isIsraelCity } from "@/lib/geo/israel-cities";
import {
  filterKnownValues,
  formatDesiredHoursLabel,
  isSitterAdditionalService,
  isSitterAgeGroup,
  isSitterCurrentStatus,
  isSitterExperienceBand,
  isSitterIncomeRange,
  isSitterTaskCapability,
  isSitterTravelDistance,
  isSitterWorkType,
  parseDesiredHoursPerWeek,
  SITTER_ADDITIONAL_SERVICE_OPTIONS,
  SITTER_AGE_GROUP_OPTIONS,
  SITTER_CURRENT_STATUS_OPTIONS,
  SITTER_EXPERIENCE_BAND_OPTIONS,
  SITTER_INCOME_RANGE_OPTIONS,
  SITTER_TASK_OPTIONS,
  SITTER_TRAVEL_DISTANCE_OPTIONS,
  SITTER_WORK_TYPE_OPTIONS,
  type SitterAgeGroup,
  type SitterExperienceBand
} from "@/lib/onboarding/sitter-options";

function labelsFor<T extends string>(
  values: readonly string[] | null | undefined,
  options: readonly { value: T; label: string }[],
  isKnown: (value: string) => value is T
): string {
  return filterKnownValues(values ?? [], isKnown)
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(" · ");
}

export function optionLabel<T extends string>(
  value: string | null | undefined,
  options: readonly { value: T; label: string }[],
  isKnown: (value: string) => value is T
): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || !isKnown(trimmed)) return "";
  return options.find((option) => option.value === trimmed)?.label ?? "";
}

export function sitterExperienceBandLabel(value: string | null | undefined): string {
  return optionLabel(value, SITTER_EXPERIENCE_BAND_OPTIONS, isSitterExperienceBand);
}

export function sitterAgeGroupsLabel(values: readonly string[] | null | undefined): string {
  return labelsFor(values, SITTER_AGE_GROUP_OPTIONS, isSitterAgeGroup);
}

export function sitterCurrentStatusLabel(value: string | null | undefined): string {
  return optionLabel(value, SITTER_CURRENT_STATUS_OPTIONS, isSitterCurrentStatus);
}

export function sitterIncomeRangeLabel(value: string | null | undefined): string {
  return optionLabel(value, SITTER_INCOME_RANGE_OPTIONS, isSitterIncomeRange);
}

export function sitterWorkTypesLabel(values: readonly string[] | null | undefined): string {
  return labelsFor(values, SITTER_WORK_TYPE_OPTIONS, isSitterWorkType);
}

export function sitterTravelDistanceLabel(value: string | null | undefined): string {
  return optionLabel(value, SITTER_TRAVEL_DISTANCE_OPTIONS, isSitterTravelDistance);
}

export function sitterAdditionalServicesLabel(values: readonly string[] | null | undefined): string {
  return labelsFor(values, SITTER_ADDITIONAL_SERVICE_OPTIONS, isSitterAdditionalService);
}

export function sitterTaskCapabilitiesLabel(values: readonly string[] | null | undefined): string {
  return labelsFor(values, SITTER_TASK_OPTIONS, isSitterTaskCapability);
}

export function sitterDesiredHoursLabel(value: number | string | null | undefined): string {
  const hours = parseDesiredHoursPerWeek(value);
  return hours == null ? "" : formatDesiredHoursLabel(hours);
}

export function sitterMaxChildrenLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value >= 5 ? "5+" : String(value);
}

export function sitterHomeCityLabel(value: string | null | undefined): string {
  const city = String(value ?? "").trim();
  return city && isIsraelCity(city) ? city : city;
}

export function experienceBandFromYears(years: number | null | undefined): SitterExperienceBand | "" {
  if (years == null || !Number.isFinite(years)) return "";
  const exact = SITTER_EXPERIENCE_BAND_OPTIONS.find((option) => option.years === years);
  if (exact && (exact.value === "1" || exact.value === "2" || exact.value === "3" || exact.value === "4" || exact.value === "5" || exact.value === "6" || exact.value === "7" || exact.value === "8" || exact.value === "9" || exact.value === "10")) {
    return exact.value;
  }
  if (years >= 16) return "16_plus";
  if (years >= 11) return "11_15";
  if (years <= 0) return "none";
  return isSitterExperienceBand(String(years)) ? (String(years) as SitterExperienceBand) : "";
}

export function parseSitterAgeGroups(values: unknown): SitterAgeGroup[] {
  if (!Array.isArray(values)) return [];
  return filterKnownValues(values.map((item) => String(item)), isSitterAgeGroup);
}

export function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}
