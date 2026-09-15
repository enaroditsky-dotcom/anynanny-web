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
  parentSpouseDateFieldsForStatus,
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

export const PARENT_QUESTIONNAIRE_STEP_COUNT = 7;
export type ParentQuestionnaireStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const PARENT_QUESTIONNAIRE_STEP_TITLES: Record<ParentQuestionnaireStep, string> = {
  1: "קצת עליך",
  2: "איפה אתם גרים?",
  3: "המשפחה שלך",
  4: "הילדים שלכם",
  5: "הבית שלכם",
  6: "איך אתם משתמשים ב-AnyNanny?",
  7: "תזכורות ותאריכים"
};

export const PARENT_QUESTIONNAIRE_STEP_DESCRIPTIONS: Record<ParentQuestionnaireStep, string> = {
  1: "נשלים כמה פרטים חיוניים כדי שנוכל להתאים לכם את השירות.",
  2: "כתובת המגורים עוזרת לנו להתאים בייביסיטר באזור שלכם.",
  3: "מצב משפחתי עוזר ל-AnyNanny לזכור תאריכים חשובים בלי לשמור פרטים מיותרים.",
  4: "פרטי הילדים עוזרים להתאים בייביסיטר ולזכור ימי הולדת.",
  5: "מידע על הבית ועל הילדים שחשוב שבייביסיטר תדע.",
  6: "כמה פרטים על איך אתם משתמשים ב-AnyNanny. אפשר לדלג על שאלות שאינן חובה.",
  7: "תזכורות ותאריכים משפחתיים — אפשר גם להמשיך בלי."
};

export function parentQuestionnaireProgressLabel(step: ParentQuestionnaireStep): string {
  return `${step}/${PARENT_QUESTIONNAIRE_STEP_COUNT}`;
}

export function parentChildrenDraftPatch(
  children: ParentChild[]
): Pick<ParentOnboardingDraft, "children" | "childrenCount"> {
  const n = children.length;
  return {
    children,
    childrenCount: n === 0 ? null : ((n >= 6 ? 6 : n) as ParentChildrenCount)
  };
}

function validateParentChildren(draft: ParentOnboardingDraft): string | null {
  const count = parseParentChildrenCount(draft.childrenCount);
  if (!count) return "יש לבחור כמה ילדים יש במשפחה.";
  const children = childBlocksForCount(count, draft.children);
  for (const [index, child] of children.entries()) {
    const nameError = validateOnboardingName(child.name, `שם פרטי של ילד/ה ${index + 1}`);
    if (nameError) return nameError;
    if (!parseIsoDateOnly(child.birthDate)) return `יש לבחור תאריך לידה לילד/ה ${index + 1}.`;
    if (isFutureIsoDate(child.birthDate)) return `תאריך הלידה של ילד/ה ${index + 1} לא יכול להיות בעתיד.`;
  }
  return null;
}

function validateParentHousehold(draft: ParentOnboardingDraft): string | null {
  if (draft.hasPets == null) return "יש לבחור האם יש בעלי חיים בבית.";
  if (draft.hasChildSpecialOrMedicalInformation == null) {
    return "יש לבחור האם יש מידע רפואי או צורך מיוחד שחשוב לדעת.";
  }
  if (draft.hasChildSpecialOrMedicalInformation && !draft.childSpecialOrMedicalDetails.trim()) {
    return "יש למלא פרטים שחשוב לדעת.";
  }
  return null;
}

function validateParentSpouseDates(draft: ParentOnboardingDraft): string | null {
  const spouseDates = parentSpouseDateFieldsForStatus(draft.maritalStatus, {
    weddingAnniversary: draft.weddingAnniversary,
    partnerDateOfBirth: draft.partnerDateOfBirth
  });
  if (spouseDates.weddingAnniversary && !optionalIsoDate(spouseDates.weddingAnniversary)) {
    return "יום הנישואין אינו תקין.";
  }
  if (spouseDates.partnerDateOfBirth) {
    if (!optionalIsoDate(spouseDates.partnerDateOfBirth) || isFutureIsoDate(spouseDates.partnerDateOfBirth)) {
      return "תאריך הלידה של בן/בת הזוג אינו תקין.";
    }
  }
  return null;
}

export function validateParentOnboardingStep(
  step: ParentQuestionnaireStep,
  draft: ParentOnboardingDraft
): string | null {
  if (step === 1) {
    const firstError = validateOnboardingName(draft.firstName, "שם פרטי");
    if (firstError) return firstError;
    const lastError = validateOnboardingName(draft.lastName, "שם משפחה");
    if (lastError) return lastError;
    const dobError = getAccountDobEligibilityError("parent", draft.birthDate);
    if (dobError) return dobError;
    if (draft.phone.trim()) {
      const phoneError = validateContactPhoneInput(draft.phone);
      if (phoneError) return phoneError;
    }
    return null;
  }

  if (step === 2) {
    if (!isIsraelCity(draft.city)) return "יש לבחור עיר / אזור מגורים.";
    return null;
  }

  if (step === 3) {
    return validateParentSpouseDates(draft);
  }

  if (step === 4) {
    return validateParentChildren(draft);
  }

  if (step === 5) {
    return validateParentHousehold(draft);
  }

  if (step === 6) {
    if (!draft.preferredLanguage || !isParentPreferredLanguage(draft.preferredLanguage)) {
      return "יש לבחור שפה מועדפת.";
    }
    return null;
  }

  return null;
}

export function firstInvalidParentOnboardingFieldId(
  step: ParentQuestionnaireStep,
  draft: ParentOnboardingDraft
): string | null {
  if (step === 1) {
    if (validateOnboardingName(draft.firstName, "שם פרטי")) return "parent-first-name";
    if (validateOnboardingName(draft.lastName, "שם משפחה")) return "parent-last-name";
    if (getAccountDobEligibilityError("parent", draft.birthDate)) return "parent-birth-date";
    if (draft.phone.trim() && validateContactPhoneInput(draft.phone)) return "parent-phone";
    return null;
  }

  if (step === 2) {
    return isIsraelCity(draft.city) ? null : "parent-city";
  }

  if (step === 3) {
    const spouseDates = parentSpouseDateFieldsForStatus(draft.maritalStatus, {
      weddingAnniversary: draft.weddingAnniversary,
      partnerDateOfBirth: draft.partnerDateOfBirth
    });
    if (spouseDates.weddingAnniversary && !optionalIsoDate(spouseDates.weddingAnniversary)) {
      return "wedding-anniversary";
    }
    if (
      spouseDates.partnerDateOfBirth &&
      (!optionalIsoDate(spouseDates.partnerDateOfBirth) || isFutureIsoDate(spouseDates.partnerDateOfBirth))
    ) {
      return "partner-dob";
    }
    return null;
  }

  if (step === 4) {
    if (!parseParentChildrenCount(draft.childrenCount)) return "parent-children-count";
    const children = childBlocksForCount(draft.childrenCount!, draft.children);
    for (const [index, child] of children.entries()) {
      if (validateOnboardingName(child.name, `שם פרטי של ילד/ה ${index + 1}`)) {
        return `child-first-name-${child.id}`;
      }
      if (!parseIsoDateOnly(child.birthDate) || isFutureIsoDate(child.birthDate)) {
        return `child-birth-date-${child.id}`;
      }
    }
    return null;
  }

  if (step === 5) {
    if (draft.hasPets == null) return "parent-has-pets";
    if (draft.hasChildSpecialOrMedicalInformation == null) return "parent-has-medical";
    if (draft.hasChildSpecialOrMedicalInformation && !draft.childSpecialOrMedicalDetails.trim()) {
      return "medical-details";
    }
    return null;
  }

  if (step === 6) {
    if (!draft.preferredLanguage || !isParentPreferredLanguage(draft.preferredLanguage)) {
      return "parent-language";
    }
  }

  return null;
}

export function parentQuestionnaireStepForRequiredError(error: string): ParentQuestionnaireStep {
  if (error.includes("עיר")) return 2;
  if (error.includes("נישואין") || error.includes("בן/בת הזוג")) return 3;
  if (error.includes("ילד")) return 4;
  if (error.includes("בעלי חיים") || error.includes("רפואי") || error.includes("פרטים שחשוב לדעת")) return 5;
  if (error.includes("שפה")) return 6;
  return 1;
}

export function validateParentOnboardingRequiredFields(draft: ParentOnboardingDraft): string | null {
  return (
    validateParentOnboardingStep(1, draft) ||
    validateParentOnboardingStep(2, draft) ||
    validateParentOnboardingStep(3, draft) ||
    validateParentOnboardingStep(4, draft) ||
    validateParentOnboardingStep(5, draft) ||
    validateParentOnboardingStep(6, draft) ||
    validateParentOnboardingStep(7, draft)
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
  const childrenCount = persistedChildrenCount(count, children);
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
  const spouseDates = parentSpouseDateFieldsForStatus(draft.maritalStatus, {
    weddingAnniversary: draft.weddingAnniversary,
    partnerDateOfBirth: draft.partnerDateOfBirth
  });

  return {
    ...parentOnboardingNamePatch({
      first_name: draft.firstName,
      last_name: draft.lastName
    }),
    birth_date: draft.birthDate || null,
    city: address.city,
    address,
    phone,
    children_count: childrenCount,
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
    wedding_date: optionalIsoDate(spouseDates.weddingAnniversary),
    spouse_birthday: optionalIsoDate(spouseDates.partnerDateOfBirth),
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
