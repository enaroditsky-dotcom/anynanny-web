import { getAccountDobEligibilityError, parseIsoDateOnly } from "@/lib/auth/age-eligibility";
import { isIsraelCity } from "@/lib/geo/israel-cities";
import {
  createEmptyChild,
  createEmptySpecialEvent,
  type ParentAddress,
  type ParentChild,
  type ParentSpecialEvent
} from "@/lib/parent/parent-profile";
import { normalizeIsraeliMobileForStorage, validateContactPhoneInput } from "@/lib/profile/contact-phone";
import {
  isParentBabysitterFrequency,
  isParentMaritalStatus,
  isParentPreferredLanguage,
  isParentReminderPreference,
  isParentTypicalNeed,
  isParentTypicalReason,
  parseParentChildrenCount,
  type ParentBabysitterFrequency,
  type ParentChildrenCount,
  type ParentMaritalStatus,
  type ParentPreferredLanguage,
  type ParentReminderPreference,
  type ParentTypicalNeed,
  type ParentTypicalReason
} from "@/lib/onboarding/parent-options";
import {
  isFutureIsoDate,
  ONBOARDING_DETAILS_MAX_LENGTH,
  optionalBoolean,
  optionalIsoDate,
  optionalTrimmedText,
  trimOnboardingName,
  uniqueStringList,
  validateOnboardingName
} from "@/lib/onboarding/shared";

export type ParentOnboardingDraft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  city: string;
  street: string;
  houseNumber: string;
  phone: string;
  childrenCount: ParentChildrenCount | null;
  children: ParentChild[];
  hasPets: boolean | null;
  petDetails: string;
  hasChildSpecialOrMedicalInformation: boolean | null;
  childSpecialOrMedicalDetails: string;
  preferredLanguage: ParentPreferredLanguage | "";
  typicalBabysittingNeed: ParentTypicalNeed[];
  maritalStatus: ParentMaritalStatus | "";
  weddingAnniversary: string;
  partnerDateOfBirth: string;
  specialDates: ParentSpecialEvent[];
  estimatedBabysitterFrequency: ParentBabysitterFrequency | "";
  typicalReasons: ParentTypicalReason[];
  typicalReasonsOther: string;
  reminderPreferences: ParentReminderPreference[];
  automaticBabysitterSuggestion: boolean | null;
};

export function emptyParentOnboardingDraft(): ParentOnboardingDraft {
  return {
    firstName: "",
    lastName: "",
    birthDate: "",
    city: "",
    street: "",
    houseNumber: "",
    phone: "",
    childrenCount: null,
    children: [],
    hasPets: null,
    petDetails: "",
    hasChildSpecialOrMedicalInformation: null,
    childSpecialOrMedicalDetails: "",
    preferredLanguage: "",
    typicalBabysittingNeed: [],
    maritalStatus: "",
    weddingAnniversary: "",
    partnerDateOfBirth: "",
    specialDates: [],
    estimatedBabysitterFrequency: "",
    typicalReasons: [],
    typicalReasonsOther: "",
    reminderPreferences: [],
    automaticBabysitterSuggestion: null
  };
}

export function childBlocksForCount(
  count: ParentChildrenCount,
  existing: ParentChild[]
): ParentChild[] {
  if (count < 6) {
    const next = existing.slice(0, count);
    while (next.length < count) next.push(createEmptyChild());
    return next;
  }
  const next = [...existing];
  while (next.length < 6) next.push(createEmptyChild());
  return next;
}

export function persistedChildrenCount(count: ParentChildrenCount, children: ParentChild[]): number {
  return count < 6 ? count : Math.max(6, children.length);
}

export function validateParentOnboardingStep(
  step: 1 | 2 | 3,
  draft: ParentOnboardingDraft
): string | null {
  if (step === 1) {
    const firstError = validateOnboardingName(draft.firstName, "שם פרטי");
    if (firstError) return firstError;
    const lastError = validateOnboardingName(draft.lastName, "שם משפחה");
    if (lastError) return lastError;
    const dobError = getAccountDobEligibilityError("parent", draft.birthDate);
    if (dobError) return dobError;
    if (!isIsraelCity(draft.city)) return "יש לבחור עיר / אזור מגורים.";
    if (draft.phone.trim()) {
      const phoneError = validateContactPhoneInput(draft.phone);
      if (phoneError) return phoneError;
    }
    if (!draft.preferredLanguage || !isParentPreferredLanguage(draft.preferredLanguage)) {
      return "יש לבחור שפה מועדפת.";
    }
    return null;
  }

  if (step === 2) {
    const count = parseParentChildrenCount(draft.childrenCount);
    if (!count) return "יש לבחור כמה ילדים יש במשפחה.";
    const children = childBlocksForCount(count, draft.children);
    for (const [index, child] of children.entries()) {
      const nameError = validateOnboardingName(child.name, `שם פרטי של ילד/ה ${index + 1}`);
      if (nameError) return nameError;
      if (!parseIsoDateOnly(child.birthDate)) return `יש לבחור תאריך לידה לילד/ה ${index + 1}.`;
      if (isFutureIsoDate(child.birthDate)) return `תאריך הלידה של ילד/ה ${index + 1} לא יכול להיות בעתיד.`;
    }
    if (draft.hasPets == null) return "יש לבחור האם יש בעלי חיים בבית.";
    if (draft.hasChildSpecialOrMedicalInformation == null) {
      return "יש לבחור האם יש מידע רפואי או צורך מיוחד שחשוב לדעת.";
    }
    if (draft.hasChildSpecialOrMedicalInformation && !draft.childSpecialOrMedicalDetails.trim()) {
      return "יש למלא פרטים שחשוב לדעת.";
    }
    return null;
  }

  if (draft.weddingAnniversary && !optionalIsoDate(draft.weddingAnniversary)) {
    return "יום הנישואין אינו תקין.";
  }
  if (draft.partnerDateOfBirth) {
    if (!optionalIsoDate(draft.partnerDateOfBirth) || isFutureIsoDate(draft.partnerDateOfBirth)) {
      return "תאריך הלידה של בן/בת הזוג אינו תקין.";
    }
  }
  return null;
}

export function validateParentOnboardingRequiredFields(draft: ParentOnboardingDraft): string | null {
  return (
    validateParentOnboardingStep(1, draft) ||
    validateParentOnboardingStep(2, draft) ||
    validateParentOnboardingStep(3, draft)
  );
}

export function parentOnboardingNamePatch(names: { first_name: string; last_name: string }) {
  const first_name = trimOnboardingName(names.first_name);
  const last_name = trimOnboardingName(names.last_name);
  if (!first_name || !last_name) return {};
  return { first_name, last_name };
}

export function buildParentOnboardingSavePayload(
  draft: ParentOnboardingDraft,
  completedAt = new Date().toISOString()
): Record<string, unknown> {
  const count = parseParentChildrenCount(draft.childrenCount) ?? 1;
  const children = childBlocksForCount(count, draft.children).map((child) => ({
    id: child.id,
    name: trimOnboardingName(child.name),
    birthDate: child.birthDate
  }));
  const specialDates = draft.specialDates
    .map((event) => ({
      id: event.id,
      title: event.title.trim(),
      date: event.date
    }))
    .filter((event) => event.title && optionalIsoDate(event.date));

  const address: ParentAddress = {
    city: draft.city.trim(),
    street: draft.street.trim(),
    houseNumber: draft.houseNumber.trim()
  };

  const phone = draft.phone.trim() ? normalizeIsraeliMobileForStorage(draft.phone) : null;

  return {
    ...parentOnboardingNamePatch({
      first_name: draft.firstName,
      last_name: draft.lastName
    }),
    birth_date: draft.birthDate || null,
    city: address.city,
    address,
    phone,
    children_count: persistedChildrenCount(count, children),
    children,
    preferred_language: draft.preferredLanguage || null,
    typical_babysitting_need: uniqueStringList(draft.typicalBabysittingNeed.filter(isParentTypicalNeed)),
    has_pets: optionalBoolean(draft.hasPets),
    pet_details: draft.hasPets ? optionalTrimmedText(draft.petDetails) : null,
    has_child_special_or_medical_information: optionalBoolean(draft.hasChildSpecialOrMedicalInformation),
    child_special_or_medical_details: draft.hasChildSpecialOrMedicalInformation
      ? optionalTrimmedText(draft.childSpecialOrMedicalDetails, ONBOARDING_DETAILS_MAX_LENGTH)
      : null,
    marital_status: draft.maritalStatus && isParentMaritalStatus(draft.maritalStatus) ? draft.maritalStatus : null,
    wedding_date: optionalIsoDate(draft.weddingAnniversary),
    spouse_birthday: optionalIsoDate(draft.partnerDateOfBirth),
    special_events: specialDates,
    estimated_babysitter_frequency:
      draft.estimatedBabysitterFrequency && isParentBabysitterFrequency(draft.estimatedBabysitterFrequency)
        ? draft.estimatedBabysitterFrequency
        : null,
    typical_reasons: uniqueStringList(draft.typicalReasons.filter(isParentTypicalReason)),
    typical_reasons_other: draft.typicalReasons.includes("other")
      ? optionalTrimmedText(draft.typicalReasonsOther)
      : null,
    reminder_preferences: uniqueStringList(draft.reminderPreferences.filter(isParentReminderPreference)),
    automatic_babysitter_suggestion: optionalBoolean(draft.automaticBabysitterSuggestion),
    parent_onboarding_completed_at: completedAt
  };
}

export function createEmptyParentSpecialDate(): ParentSpecialEvent {
  return createEmptySpecialEvent();
}
