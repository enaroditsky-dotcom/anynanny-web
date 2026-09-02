export const PARENT_CHILDREN_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
export type ParentChildrenCount = (typeof PARENT_CHILDREN_COUNT_OPTIONS)[number];

export const PARENT_LANGUAGE_OPTIONS = ["עברית", "ערבית", "רוסית", "צרפתית", "אנגלית"] as const;
export type ParentPreferredLanguage = (typeof PARENT_LANGUAGE_OPTIONS)[number];

export const PARENT_TYPICAL_NEED_OPTIONS = [
  { value: "morning", label: "בוקר" },
  { value: "afternoon", label: "אחר הצהריים" },
  { value: "evening", label: "ערב" },
  { value: "night", label: "לילה" },
  { value: "weekday", label: "אמצע שבוע" },
  { value: "weekend", label: "סוף שבוע" }
] as const;
export type ParentTypicalNeed = (typeof PARENT_TYPICAL_NEED_OPTIONS)[number]["value"];

export const PARENT_MARITAL_STATUS_OPTIONS = [
  { value: "married", label: "נשוי/אה" },
  { value: "partnered", label: "בזוגיות" },
  { value: "single", label: "יחידני/ת" },
  { value: "divorced", label: "גרוש/ה" },
  { value: "widowed", label: "אלמן/ה" },
  { value: "prefer_not_to_say", label: "מעדיפ/ה לא לציין" }
] as const;
export type ParentMaritalStatus = (typeof PARENT_MARITAL_STATUS_OPTIONS)[number]["value"];

export const PARENT_FREQUENCY_OPTIONS = [
  { value: "less_than_monthly", label: "פחות מפעם בחודש" },
  { value: "monthly", label: "פעם בחודש" },
  { value: "two_to_three_monthly", label: "2–3 פעמים בחודש" },
  { value: "weekly", label: "פעם בשבוע" },
  { value: "several_weekly", label: "מספר פעמים בשבוע" },
  { value: "as_needed", label: "משתנה / לפי הצורך" }
] as const;
export type ParentBabysitterFrequency = (typeof PARENT_FREQUENCY_OPTIONS)[number]["value"];

export const PARENT_REASON_OPTIONS = [
  { value: "date_night", label: "יציאה זוגית" },
  { value: "work", label: "עבודה" },
  { value: "event", label: "אירוע" },
  { value: "errands", label: "סידורים" },
  { value: "pickup", label: "איסוף / ליווי ילדים" },
  { value: "regular_help", label: "עזרה קבועה" },
  { value: "holidays", label: "חופשות" },
  { value: "other", label: "אחר" }
] as const;
export type ParentTypicalReason = (typeof PARENT_REASON_OPTIONS)[number]["value"];

export const PARENT_REMINDER_OPTIONS = [
  { value: "anniversary", label: "יום נישואין" },
  { value: "birthdays", label: "ימי הולדת" },
  { value: "holidays", label: "חגים" },
  { value: "custom_dates", label: "תאריכים מיוחדים שהזנתי" },
  { value: "not_now", label: "לא מעוניין/ת כרגע" }
] as const;
export type ParentReminderPreference = (typeof PARENT_REMINDER_OPTIONS)[number]["value"];

const PARENT_LANGUAGE_SET = new Set<string>(PARENT_LANGUAGE_OPTIONS);
const PARENT_NEED_SET = new Set<string>(PARENT_TYPICAL_NEED_OPTIONS.map((option) => option.value));
const PARENT_MARITAL_SET = new Set<string>(PARENT_MARITAL_STATUS_OPTIONS.map((option) => option.value));
const PARENT_FREQUENCY_SET = new Set<string>(PARENT_FREQUENCY_OPTIONS.map((option) => option.value));
const PARENT_REASON_SET = new Set<string>(PARENT_REASON_OPTIONS.map((option) => option.value));
const PARENT_REMINDER_SET = new Set<string>(PARENT_REMINDER_OPTIONS.map((option) => option.value));

export function isParentPreferredLanguage(value: string): value is ParentPreferredLanguage {
  return PARENT_LANGUAGE_SET.has(value);
}

export function isParentTypicalNeed(value: string): value is ParentTypicalNeed {
  return PARENT_NEED_SET.has(value);
}

export function isParentMaritalStatus(value: string): value is ParentMaritalStatus {
  return PARENT_MARITAL_SET.has(value);
}

export function isParentBabysitterFrequency(value: string): value is ParentBabysitterFrequency {
  return PARENT_FREQUENCY_SET.has(value);
}

export function isParentTypicalReason(value: string): value is ParentTypicalReason {
  return PARENT_REASON_SET.has(value);
}

export function isParentReminderPreference(value: string): value is ParentReminderPreference {
  return PARENT_REMINDER_SET.has(value);
}

export function parseParentChildrenCount(value: unknown): ParentChildrenCount | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!PARENT_CHILDREN_COUNT_OPTIONS.includes(n as ParentChildrenCount)) return null;
  return n as ParentChildrenCount;
}
