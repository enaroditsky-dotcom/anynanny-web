export const SITTER_AGE_GROUP_OPTIONS = [
  { value: "infants", label: "תינוקות" },
  { value: "toddlers", label: "פעוטות" },
  { value: "preschool", label: "גן" },
  { value: "elementary", label: "בית ספר יסודי" },
  { value: "older", label: "ילדים גדולים יותר" }
] as const;
export type SitterAgeGroup = (typeof SITTER_AGE_GROUP_OPTIONS)[number]["value"];

export const SITTER_EXPERIENCE_BAND_OPTIONS = [
  { value: "none", label: "ללא ניסיון", years: 0 },
  { value: "under_1", label: "פחות משנה", years: 0 },
  { value: "1", label: "1", years: 1 },
  { value: "2", label: "2", years: 2 },
  { value: "3", label: "3", years: 3 },
  { value: "4", label: "4", years: 4 },
  { value: "5", label: "5", years: 5 },
  { value: "6", label: "6", years: 6 },
  { value: "7", label: "7", years: 7 },
  { value: "8", label: "8", years: 8 },
  { value: "9", label: "9", years: 9 },
  { value: "10", label: "10", years: 10 },
  { value: "11_15", label: "11–15", years: 11 },
  { value: "16_plus", label: "16+", years: 16 }
] as const;
export type SitterExperienceBand = (typeof SITTER_EXPERIENCE_BAND_OPTIONS)[number]["value"];

export const SITTER_CURRENT_STATUS_OPTIONS = [
  { value: "student_high_school", label: "תלמידה" },
  { value: "military_national", label: "חיילת / שירות לאומי" },
  { value: "student_higher", label: "סטודנטית" },
  { value: "full_time", label: "עובדת במשרה מלאה" },
  { value: "part_time", label: "עובדת במשרה חלקית" },
  { value: "self_employed", label: "עצמאית" },
  { value: "other", label: "אחר" },
  { value: "prefer_not_to_say", label: "מעדיפה לא לציין" }
] as const;
export type SitterCurrentStatus = (typeof SITTER_CURRENT_STATUS_OPTIONS)[number]["value"];

export const SITTER_INCOME_RANGE_OPTIONS = [
  { value: "up_to_1000", label: "עד ₪1,000" },
  { value: "1000_2000", label: "₪1,000–2,000" },
  { value: "2000_3000", label: "₪2,000–3,000" },
  { value: "3000_5000", label: "₪3,000–5,000" },
  { value: "over_5000", label: "מעל ₪5,000" }
] as const;
export type SitterIncomeRange = (typeof SITTER_INCOME_RANGE_OPTIONS)[number]["value"];

export const SITTER_WORK_TYPE_OPTIONS = [
  { value: "occasional", label: "משמרות מזדמנות" },
  { value: "one_family", label: "משפחה קבועה" },
  { value: "several_families", label: "כמה משפחות קבועות" },
  { value: "evenings", label: "עבודה בערבים" },
  { value: "weekends", label: "עבודה בסופי שבוע" }
] as const;
export type SitterWorkType = (typeof SITTER_WORK_TYPE_OPTIONS)[number]["value"];

export const SITTER_TRAVEL_DISTANCE_OPTIONS = [
  { value: "up_to_2km", label: 'עד 2 ק"מ' },
  { value: "up_to_5km", label: 'עד 5 ק"מ' },
  { value: "up_to_10km", label: 'עד 10 ק"מ' },
  { value: "up_to_20km", label: 'עד 20 ק"מ' },
  { value: "over_20km", label: 'מעבר ל-20 ק"מ' }
] as const;
export type SitterTravelDistance = (typeof SITTER_TRAVEL_DISTANCE_OPTIONS)[number]["value"];

export const SITTER_ADDITIONAL_SERVICE_OPTIONS = [
  { value: "homework", label: "עזרה בשיעורי בית" },
  { value: "pickup", label: "איסוף ילדים" },
  { value: "activities", label: "ליווי לחוגים" },
  { value: "infants", label: "טיפול בתינוקות" },
  { value: "light_cooking", label: "בישול קל" },
  { value: "pets", label: "טיפול בחיות" },
  { value: "not_now", label: "לא מעוניינת כרגע" }
] as const;
export type SitterAdditionalService = (typeof SITTER_ADDITIONAL_SERVICE_OPTIONS)[number]["value"];

export const SITTER_TASK_OPTIONS = [
  { value: "light_meal", label: "הכנת ארוחה קלה" },
  { value: "bath", label: "מקלחת" },
  { value: "bedtime", label: "השכבה לישון" },
  { value: "homework", label: "עזרה בשיעורי בית" },
  { value: "pickup", label: "איסוף ממסגרת" },
  { value: "garden", label: "יציאה לגינה" },
  { value: "late_hours", label: "משמרות עד שעות מאוחרות" }
] as const;
export type SitterTaskCapability = (typeof SITTER_TASK_OPTIONS)[number]["value"];

export const SITTER_MAX_CHILDREN_OPTIONS = [1, 2, 3, 4, 5] as const;
export type SitterMaxChildren = (typeof SITTER_MAX_CHILDREN_OPTIONS)[number];

export const SITTER_DESIRED_HOURS_MIN = 1;
export const SITTER_DESIRED_HOURS_MAX = 50;

const EXPERIENCE_BAND_SET = new Set(SITTER_EXPERIENCE_BAND_OPTIONS.map((option) => option.value));
const AGE_GROUP_SET = new Set(SITTER_AGE_GROUP_OPTIONS.map((option) => option.value));
const STATUS_SET = new Set(SITTER_CURRENT_STATUS_OPTIONS.map((option) => option.value));
const INCOME_SET = new Set(SITTER_INCOME_RANGE_OPTIONS.map((option) => option.value));
const WORK_TYPE_SET = new Set(SITTER_WORK_TYPE_OPTIONS.map((option) => option.value));
const TRAVEL_SET = new Set(SITTER_TRAVEL_DISTANCE_OPTIONS.map((option) => option.value));
const ADDITIONAL_SET = new Set(SITTER_ADDITIONAL_SERVICE_OPTIONS.map((option) => option.value));
const TASK_SET = new Set(SITTER_TASK_OPTIONS.map((option) => option.value));

export function isSitterExperienceBand(value: string): value is SitterExperienceBand {
  return EXPERIENCE_BAND_SET.has(value as SitterExperienceBand);
}

export function isSitterAgeGroup(value: string): value is SitterAgeGroup {
  return AGE_GROUP_SET.has(value as SitterAgeGroup);
}

export function isSitterCurrentStatus(value: string): value is SitterCurrentStatus {
  return STATUS_SET.has(value as SitterCurrentStatus);
}

export function isSitterIncomeRange(value: string): value is SitterIncomeRange {
  return INCOME_SET.has(value as SitterIncomeRange);
}

export function isSitterWorkType(value: string): value is SitterWorkType {
  return WORK_TYPE_SET.has(value as SitterWorkType);
}

export function isSitterTravelDistance(value: string): value is SitterTravelDistance {
  return TRAVEL_SET.has(value as SitterTravelDistance);
}

export function isSitterAdditionalService(value: string): value is SitterAdditionalService {
  return ADDITIONAL_SET.has(value as SitterAdditionalService);
}

export function isSitterTaskCapability(value: string): value is SitterTaskCapability {
  return TASK_SET.has(value as SitterTaskCapability);
}

export function yearsExperienceFromBand(band: SitterExperienceBand): number {
  return SITTER_EXPERIENCE_BAND_OPTIONS.find((option) => option.value === band)?.years ?? 0;
}

export function parseDesiredHoursPerWeek(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < SITTER_DESIRED_HOURS_MIN || n > SITTER_DESIRED_HOURS_MAX) {
    return null;
  }
  return n;
}

export function formatDesiredHoursLabel(hours: number): string {
  return `${hours} שעות בשבוע`;
}

export function filterKnownValues<T extends string>(
  values: readonly string[],
  isKnown: (value: string) => value is T
): T[] {
  return [...new Set(values.filter(isKnown))];
}
