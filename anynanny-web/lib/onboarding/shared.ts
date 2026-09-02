export const REQUIRED_FIELDS_NOTE = "שדות המסומנים בכוכבית (*) הם שדות חובה";

export const ONBOARDING_STEP_COUNT = 4;

export const ONBOARDING_NAME_MAX_LENGTH = 80;
export const ONBOARDING_SHORT_TEXT_MAX_LENGTH = 280;
export const ONBOARDING_DETAILS_MAX_LENGTH = 1000;

export function trimOnboardingName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateOnboardingName(value: unknown, label: string): string | null {
  const trimmed = trimOnboardingName(value);
  if (!trimmed) return `יש להזין ${label}.`;
  if (trimmed.length > ONBOARDING_NAME_MAX_LENGTH) return `${label} ארוך מדי.`;
  return null;
}

export function isFutureIsoDate(value: string, asOf = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return false;
  }
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return probe.getTime() > today.getTime();
}

export function optionalIsoDate(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function todayIsoDate(asOf = new Date()): string {
  const year = asOf.getFullYear();
  const month = String(asOf.getMonth() + 1).padStart(2, "0");
  const day = String(asOf.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function optionalTrimmedText(value: unknown, max = ONBOARDING_SHORT_TEXT_MAX_LENGTH): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function uniqueStringList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function optionalBoolean(value: boolean | null): boolean | null {
  return value === true || value === false ? value : null;
}
