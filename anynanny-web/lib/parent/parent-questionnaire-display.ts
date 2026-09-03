import {
  isParentBabysitterFrequency,
  isParentMaritalStatus,
  isParentPreferredLanguage,
  isParentReminderPreference,
  isParentTypicalNeed,
  isParentTypicalReason,
  PARENT_FREQUENCY_OPTIONS,
  PARENT_LANGUAGE_OPTIONS,
  PARENT_MARITAL_STATUS_OPTIONS,
  PARENT_REASON_OPTIONS,
  PARENT_REMINDER_OPTIONS,
  PARENT_TYPICAL_NEED_OPTIONS
} from "@/lib/onboarding/parent-options";

function labelsFor<T extends string>(
  values: readonly string[],
  options: readonly { value: T; label: string }[],
  isKnown: (value: string) => value is T
): string {
  return values
    .filter(isKnown)
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(" · ");
}

export function parentPreferredLanguageLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  return trimmed && isParentPreferredLanguage(trimmed) ? trimmed : "";
}

export function parentMaritalStatusLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || !isParentMaritalStatus(trimmed)) return "";
  return PARENT_MARITAL_STATUS_OPTIONS.find((option) => option.value === trimmed)?.label ?? "";
}

export function parentTypicalNeedLabel(values: readonly string[] | null | undefined): string {
  return labelsFor(values ?? [], PARENT_TYPICAL_NEED_OPTIONS, isParentTypicalNeed);
}

export function parentFrequencyLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || !isParentBabysitterFrequency(trimmed)) return "";
  return PARENT_FREQUENCY_OPTIONS.find((option) => option.value === trimmed)?.label ?? "";
}

export function parentTypicalReasonsLabel(
  values: readonly string[] | null | undefined,
  other?: string | null
): string {
  const labels = labelsFor(values ?? [], PARENT_REASON_OPTIONS, isParentTypicalReason);
  if ((values ?? []).includes("other") && other?.trim()) {
    return labels ? `${labels} (${other.trim()})` : other.trim();
  }
  return labels;
}

export function parentReminderLabel(values: readonly string[] | null | undefined): string {
  return labelsFor(values ?? [], PARENT_REMINDER_OPTIONS, isParentReminderPreference);
}

export const PARENT_LANGUAGE_SELECT_OPTIONS = PARENT_LANGUAGE_OPTIONS.map((value) => ({
  value,
  label: value
}));
