import { getAccountDobEligibilityError } from "@/lib/auth/age-eligibility";
import { isIsraelCity, normalizeWorkingCities, type IsraelCity } from "@/lib/geo/israel-cities";
import {
  filterKnownValues,
  isSitterAdditionalService,
  isSitterAgeGroup,
  isSitterCurrentStatus,
  isSitterExperienceBand,
  isSitterIncomeRange,
  isSitterTaskCapability,
  isSitterTravelDistance,
  isSitterWorkType,
  parseDesiredHoursPerWeek,
  yearsExperienceFromBand,
  type SitterAdditionalService,
  type SitterAgeGroup,
  type SitterCurrentStatus,
  type SitterExperienceBand,
  type SitterIncomeRange,
  type SitterMaxChildren,
  type SitterTaskCapability,
  type SitterTravelDistance,
  type SitterWorkType
} from "@/lib/onboarding/sitter-options";
import {
  optionalBoolean,
  optionalTrimmedText,
  trimOnboardingName,
  validateOnboardingName
} from "@/lib/onboarding/shared";
import { normalizeIsraeliMobileForStorage, validateContactPhoneInput } from "@/lib/profile/contact-phone";
import { normalizeSitterLanguages, type SitterLanguage } from "@/lib/sitter/sitter-profile";

export type SitterOnboardingDraft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  homeCity: string;
  preferredWorkArea: IsraelCity[];
  phone: string;
  languages: SitterLanguage[];
  yearsExperienceBand: SitterExperienceBand | "";
  experienceAgeGroups: SitterAgeGroup[];
  hourlyRateNis: string;
  hasDriversLicense: boolean | null;
  hasCar: boolean | null;
  isSmoker: boolean | null;
  hasBabyExperience: boolean | null;
  hasMultipleChildrenExperience: boolean | null;
  currentStatus: SitterCurrentStatus | "";
  desiredHoursPerWeek: string;
  desiredMonthlyIncomeRange: SitterIncomeRange | "";
  workTypePreferences: SitterWorkType[];
  travelDistance: SitterTravelDistance | "";
  acceptsShortNoticeShifts: boolean | null;
  additionalServiceInterests: SitterAdditionalService[];
  preferredChildAgeGroups: SitterAgeGroup[];
  maxChildren: SitterMaxChildren | null;
  hasSpecialNeedsExperience: boolean | null;
  specialNeedsExperienceDetails: string;
  taskCapabilities: SitterTaskCapability[];
  hasFirstAidTraining: boolean | null;
  hasChildcareTraining: boolean | null;
  childcareTrainingDetails: string;
};

export function emptySitterOnboardingDraft(): SitterOnboardingDraft {
  return {
    firstName: "",
    lastName: "",
    birthDate: "",
    homeCity: "",
    preferredWorkArea: [],
    phone: "",
    languages: [],
    yearsExperienceBand: "",
    experienceAgeGroups: [],
    hourlyRateNis: "",
    hasDriversLicense: null,
    hasCar: null,
    isSmoker: null,
    hasBabyExperience: null,
    hasMultipleChildrenExperience: null,
    currentStatus: "",
    desiredHoursPerWeek: "",
    desiredMonthlyIncomeRange: "",
    workTypePreferences: [],
    travelDistance: "",
    acceptsShortNoticeShifts: null,
    additionalServiceInterests: [],
    preferredChildAgeGroups: [],
    maxChildren: null,
    hasSpecialNeedsExperience: null,
    specialNeedsExperienceDetails: "",
    taskCapabilities: [],
    hasFirstAidTraining: null,
    hasChildcareTraining: null,
    childcareTrainingDetails: ""
  };
}

export function parseSitterHourlyRate(value: string): number | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function validateSitterOnboardingStep(
  step: 1 | 2 | 3,
  draft: SitterOnboardingDraft,
  isExpert = false
): string | null {
  if (step === 1) {
    const firstError = validateOnboardingName(draft.firstName, "שם פרטי");
    if (firstError) return firstError;
    const lastError = validateOnboardingName(draft.lastName, "שם משפחה");
    if (lastError) return lastError;
    const dobError = getAccountDobEligibilityError("sitter", draft.birthDate);
    if (dobError) return dobError;
    if (!isIsraelCity(draft.homeCity)) return "יש לבחור עיר / אזור מגורים.";
    if (normalizeWorkingCities(draft.preferredWorkArea).length === 0) {
      return "יש לבחור אזור עבודה מועדף.";
    }
    if (draft.phone.trim()) {
      const phoneError = validateContactPhoneInput(draft.phone);
      if (phoneError) return phoneError;
    }
    if (normalizeSitterLanguages(draft.languages).length === 0) return "יש לבחור לפחות שפה אחת.";
    return null;
  }

  if (step === 2 && !isExpert) {
    if (!draft.yearsExperienceBand || !isSitterExperienceBand(draft.yearsExperienceBand)) {
      return "יש לבחור שנות ניסיון.";
    }
    if (filterKnownValues(draft.experienceAgeGroups, isSitterAgeGroup).length === 0) {
      return "יש לבחור עם אילו גילאים יש לך ניסיון.";
    }
    if (parseSitterHourlyRate(draft.hourlyRateNis) == null) {
      return "יש להזין מחיר לשעה תקין.";
    }
    return null;
  }

  if (step === 3) {
    if (draft.desiredHoursPerWeek.trim() && parseDesiredHoursPerWeek(draft.desiredHoursPerWeek) == null) {
      return "יש לבחור מספר שעות בין 1 ל-50.";
    }
  }
  return null;
}

export function validateSitterOnboardingRequiredFields(
  draft: SitterOnboardingDraft,
  isExpert = false
): string | null {
  return (
    validateSitterOnboardingStep(1, draft, isExpert) ||
    validateSitterOnboardingStep(2, draft, isExpert) ||
    validateSitterOnboardingStep(3, draft, isExpert)
  );
}

export function buildSitterOnboardingCorePayload(draft: SitterOnboardingDraft): Record<string, unknown> {
  const rate = parseSitterHourlyRate(draft.hourlyRateNis);
  const band = draft.yearsExperienceBand && isSitterExperienceBand(draft.yearsExperienceBand)
    ? draft.yearsExperienceBand
    : null;
  const workingCities = normalizeWorkingCities(draft.preferredWorkArea);

  return {
    first_name: trimOnboardingName(draft.firstName),
    last_name: trimOnboardingName(draft.lastName),
    birth_date: draft.birthDate || null,
    home_city: draft.homeCity,
    working_cities: workingCities,
    languages: normalizeSitterLanguages(draft.languages),
    years_experience_band: band,
    years_experience: band ? yearsExperienceFromBand(band) : null,
    experience_age_groups: filterKnownValues(draft.experienceAgeGroups, isSitterAgeGroup),
    hourly_rate_nis: rate,
    pricing_model: rate != null ? "hourly" : undefined,
    has_drivers_license: optionalBoolean(draft.hasDriversLicense),
    has_car: optionalBoolean(draft.hasCar),
    is_smoker: optionalBoolean(draft.isSmoker),
    has_baby_experience: optionalBoolean(draft.hasBabyExperience),
    has_multiple_children_experience: optionalBoolean(draft.hasMultipleChildrenExperience)
  };
}

export function buildSitterOnboardingExtendedPayload(draft: SitterOnboardingDraft): Record<string, unknown> {
  return {
    current_status: draft.currentStatus && isSitterCurrentStatus(draft.currentStatus) ? draft.currentStatus : null,
    desired_hours_per_week: parseDesiredHoursPerWeek(draft.desiredHoursPerWeek),
    desired_monthly_income_range:
      draft.desiredMonthlyIncomeRange && isSitterIncomeRange(draft.desiredMonthlyIncomeRange)
        ? draft.desiredMonthlyIncomeRange
        : null,
    work_type_preferences: filterKnownValues(draft.workTypePreferences, isSitterWorkType),
    travel_distance:
      draft.travelDistance && isSitterTravelDistance(draft.travelDistance) ? draft.travelDistance : null,
    accepts_short_notice_shifts: optionalBoolean(draft.acceptsShortNoticeShifts),
    additional_service_interests: filterKnownValues(draft.additionalServiceInterests, isSitterAdditionalService),
    preferred_child_age_groups: filterKnownValues(draft.preferredChildAgeGroups, isSitterAgeGroup),
    max_children: draft.maxChildren,
    has_special_needs_experience: optionalBoolean(draft.hasSpecialNeedsExperience),
    special_needs_experience_details: draft.hasSpecialNeedsExperience
      ? optionalTrimmedText(draft.specialNeedsExperienceDetails)
      : null,
    task_capabilities: filterKnownValues(draft.taskCapabilities, isSitterTaskCapability),
    has_first_aid_training: optionalBoolean(draft.hasFirstAidTraining),
    has_childcare_training: optionalBoolean(draft.hasChildcareTraining),
    childcare_training_details: draft.hasChildcareTraining
      ? optionalTrimmedText(draft.childcareTrainingDetails)
      : null
  };
}

export function buildSitterProfilePhonePatch(phone: string): { phone: string } | Record<string, never> {
  const trimmed = phone.trim();
  if (!trimmed) return {};
  const stored = normalizeIsraeliMobileForStorage(trimmed);
  return stored ? { phone: stored } : {};
}

export function sitterPreferredWorkAreaFromDraft(draft: SitterOnboardingDraft): IsraelCity[] {
  return normalizeWorkingCities(draft.preferredWorkArea);
}

function pickOptionalBoolean(body: Record<string, unknown>, prev: unknown, key: string): boolean | null {
  if (body[key] !== undefined) return optionalBoolean(body[key] as boolean | null);
  if (prev === true || prev === false) return prev;
  return null;
}

function pickStringList(
  body: Record<string, unknown>,
  prev: unknown,
  key: string,
  isKnown: (value: string) => boolean
): string[] {
  const source = body[key] !== undefined ? body[key] : prev;
  if (!Array.isArray(source)) return [];
  return filterKnownValues(
    source.map((item) => String(item)),
    isKnown as (value: string) => value is string
  );
}

/** Merge onboarding questionnaire columns for Personal Area PUT. Same DB fields as onboarding. */
export function pickSitterQuestionnairePutFields(
  body: Record<string, unknown>,
  prev: {
    home_city?: string | null;
    years_experience_band?: string | null;
    experience_age_groups?: string[] | null;
    has_drivers_license?: boolean | null;
    is_smoker?: boolean | null;
    has_baby_experience?: boolean | null;
    has_multiple_children_experience?: boolean | null;
    current_status?: string | null;
    desired_hours_per_week?: number | null;
    desired_monthly_income_range?: string | null;
    work_type_preferences?: string[] | null;
    travel_distance?: string | null;
    accepts_short_notice_shifts?: boolean | null;
    additional_service_interests?: string[] | null;
    preferred_child_age_groups?: string[] | null;
    max_children?: number | null;
    has_special_needs_experience?: boolean | null;
    special_needs_experience_details?: string | null;
    task_capabilities?: string[] | null;
    has_first_aid_training?: boolean | null;
    has_childcare_training?: boolean | null;
    childcare_training_details?: string | null;
  }
): Record<string, unknown> {
  const homeCity = body.home_city !== undefined ? String(body.home_city ?? "").trim() : String(prev.home_city ?? "").trim();
  const bandRaw =
    body.years_experience_band !== undefined
      ? String(body.years_experience_band ?? "")
      : String(prev.years_experience_band ?? "");
  const band = isSitterExperienceBand(bandRaw) ? bandRaw : null;
  const hours =
    body.desired_hours_per_week !== undefined
      ? parseDesiredHoursPerWeek(body.desired_hours_per_week)
      : parseDesiredHoursPerWeek(prev.desired_hours_per_week);
  const maxChildrenRaw = body.max_children !== undefined ? body.max_children : prev.max_children;
  const maxChildren =
    maxChildrenRaw == null || maxChildrenRaw === ""
      ? null
      : Number(maxChildrenRaw) >= 1 && Number(maxChildrenRaw) <= 5
        ? Number(maxChildrenRaw)
        : null;
  const hasSpecialNeeds = pickOptionalBoolean(body, prev.has_special_needs_experience, "has_special_needs_experience");
  const hasTraining = pickOptionalBoolean(body, prev.has_childcare_training, "has_childcare_training");

  return {
    home_city: homeCity && isIsraelCity(homeCity) ? homeCity : homeCity || null,
    years_experience_band: band,
    ...(band ? { years_experience: yearsExperienceFromBand(band) } : {}),
    experience_age_groups: pickStringList(body, prev.experience_age_groups, "experience_age_groups", isSitterAgeGroup),
    has_drivers_license: pickOptionalBoolean(body, prev.has_drivers_license, "has_drivers_license"),
    is_smoker: pickOptionalBoolean(body, prev.is_smoker, "is_smoker"),
    has_baby_experience: pickOptionalBoolean(body, prev.has_baby_experience, "has_baby_experience"),
    has_multiple_children_experience: pickOptionalBoolean(
      body,
      prev.has_multiple_children_experience,
      "has_multiple_children_experience"
    ),
    current_status:
      (body.current_status !== undefined ? String(body.current_status ?? "") : String(prev.current_status ?? "")) &&
      isSitterCurrentStatus(String(body.current_status !== undefined ? body.current_status : prev.current_status ?? ""))
        ? String(body.current_status !== undefined ? body.current_status : prev.current_status)
        : null,
    desired_hours_per_week: hours,
    desired_monthly_income_range: (() => {
      const raw = String(body.desired_monthly_income_range !== undefined ? body.desired_monthly_income_range : prev.desired_monthly_income_range ?? "");
      return isSitterIncomeRange(raw) ? raw : null;
    })(),
    work_type_preferences: pickStringList(body, prev.work_type_preferences, "work_type_preferences", isSitterWorkType),
    travel_distance: (() => {
      const raw = String(body.travel_distance !== undefined ? body.travel_distance : prev.travel_distance ?? "");
      return isSitterTravelDistance(raw) ? raw : null;
    })(),
    accepts_short_notice_shifts: pickOptionalBoolean(body, prev.accepts_short_notice_shifts, "accepts_short_notice_shifts"),
    additional_service_interests: pickStringList(
      body,
      prev.additional_service_interests,
      "additional_service_interests",
      isSitterAdditionalService
    ),
    preferred_child_age_groups: pickStringList(
      body,
      prev.preferred_child_age_groups,
      "preferred_child_age_groups",
      isSitterAgeGroup
    ),
    max_children: maxChildren,
    has_special_needs_experience: hasSpecialNeeds,
    special_needs_experience_details:
      hasSpecialNeeds === true
        ? optionalTrimmedText(
            body.special_needs_experience_details !== undefined
              ? body.special_needs_experience_details
              : prev.special_needs_experience_details
          )
        : null,
    task_capabilities: pickStringList(body, prev.task_capabilities, "task_capabilities", isSitterTaskCapability),
    has_first_aid_training: pickOptionalBoolean(body, prev.has_first_aid_training, "has_first_aid_training"),
    has_childcare_training: hasTraining,
    childcare_training_details:
      hasTraining === true
        ? optionalTrimmedText(
            body.childcare_training_details !== undefined
              ? body.childcare_training_details
              : prev.childcare_training_details
          )
        : null
  };
}
