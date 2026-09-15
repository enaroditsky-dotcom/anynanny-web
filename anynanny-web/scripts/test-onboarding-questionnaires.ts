import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_FIELDS_NOTE } from "../lib/onboarding/shared";
import {
  buildParentOnboardingSavePayload,
  childBlocksForCount,
  emptyParentOnboardingDraft,
  validateParentOnboardingRequiredFields,
  validateParentOnboardingStep
} from "../lib/onboarding/parent-questionnaire";
import {
  parentShowsPartnerDateOfBirth,
  parentShowsWeddingAnniversary,
  parentSpouseDateFieldsForStatus
} from "../lib/onboarding/parent-options";
import {
  buildSitterOnboardingCorePayload,
  buildSitterOnboardingExtendedPayload,
  emptySitterOnboardingDraft,
  parseSitterHourlyRate,
  sitterPreferredWorkAreaFromDraft,
  validateSitterOnboardingRequiredFields,
  validateSitterOnboardingStep,
  type SitterOnboardingDraft
} from "../lib/onboarding/sitter-questionnaire";
import { parseDesiredHoursPerWeek, yearsExperienceFromBand } from "../lib/onboarding/sitter-options";
import { ISRAEL_CITIES } from "../lib/geo/israel-cities";
import { toListPublicSittersSearchRpcArgs } from "../lib/sitter/parent-search-filters";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const parentWizard = read("components/parent/parent-onboarding-wizard.tsx");
const sitterWizard = read("components/sitter/sitter-onboarding-wizard.tsx");
const shell = read("components/onboarding/onboarding-shell.tsx");
const fields = read("components/onboarding/onboarding-fields.tsx");
const migration = read("supabase/migrations/20260902204011_onboarding_questionnaire_fields.sql");
const searchFilters = read("lib/sitter/parent-search-filters.ts");
const latestSearch = read("supabase/migrations/20260823003000_respect_sitter_full_name_privacy.sql");

const validParent = {
  ...emptyParentOnboardingDraft(),
  firstName: "נועה",
  lastName: "לוי",
  birthDate: "1990-01-15",
  city: "חיפה",
  preferredLanguage: "עברית" as const,
  childrenCount: 2 as const,
  children: childBlocksForCount(2, []).map((child, index) => ({
    ...child,
    name: index === 0 ? "עומר" : "מיה",
    birthDate: index === 0 ? "2018-03-02" : "2021-07-11"
  })),
  hasPets: false,
  hasChildSpecialOrMedicalInformation: false
};

const validSitter: SitterOnboardingDraft = {
  ...emptySitterOnboardingDraft(),
  firstName: "יעל",
  lastName: "כהן",
  birthDate: "2002-04-10",
  homeCity: "חיפה",
  preferredWorkArea: ["חיפה", "יקנעם עילית"],
  languages: ["עברית"],
  yearsExperienceBand: "3",
  experienceAgeGroups: ["toddlers"],
  hourlyRateNis: "55"
};

// 1–4 Parent names, asterisks, required note
assert.match(parentWizard, /label="שם פרטי"/);
assert.match(parentWizard, /label="שם משפחה"/);
assert.doesNotMatch(parentWizard, /שם מלא|Full Name|full_name|fullName/);
assert.match(parentWizard, /required/);
assert.match(shell, /REQUIRED_FIELDS_NOTE/);
assert.equal(REQUIRED_FIELDS_NOTE, "שדות המסומנים בכוכבית (*) הם שדות חובה");
assert.match(fields, /sr-only/);
assert.match(fields, /\*/);

// 5–7 children + dates + add/remove
assert.equal(childBlocksForCount(3, []).length, 3);
assert.equal(childBlocksForCount(6, []).length, 6);
assert.match(parentWizard, /ילד\/ה \{index \+ 1\}/);
assert.match(parentWizard, /OnboardingDateInput/);
assert.match(parentWizard, /disallowFuture/);
assert.match(parentWizard, /label="מספר טלפון"/);
assert.match(parentWizard, /label="שפה מועדפת"/);
assert.match(parentWizard, /OnboardingYesNo/);
assert.match(parentWizard, /PARENT_TYPICAL_NEED_OPTIONS/);
assert.match(parentWizard, /PARENT_FREQUENCY_OPTIONS/);
assert.match(parentWizard, /PARENT_REASON_OPTIONS/);
assert.match(parentWizard, /PARENT_REMINDER_OPTIONS/);
assert.match(parentWizard, /automaticBabysitterSuggestion/);
assert.match(parentWizard, /הוספת ילד\/ה/);
assert.doesNotMatch(parentWizard, /type="checkbox"/);

// 8–11 optional business questions
assert.equal(validateParentOnboardingStep(3, validParent), null);
assert.equal(validateParentOnboardingRequiredFields(validParent), null);
const parentPayload = buildParentOnboardingSavePayload(validParent, "2026-09-02T00:00:00.000Z");
assert.equal(parentPayload.wedding_date, null);
assert.equal(parentPayload.spouse_birthday, null);
assert.deepEqual(parentPayload.special_events, []);
assert.equal(parentPayload.automatic_babysitter_suggestion, null);
assert.equal(parentPayload.parent_onboarding_completed_at, "2026-09-02T00:00:00.000Z");
assert.equal(parentPayload.first_name, "נועה");
assert.equal(parentPayload.last_name, "לוי");
assert.equal((parentPayload.address as { city: string }).city, "חיפה");
assert.equal(parentPayload.children_count, 2);
assert.equal(parentPayload.has_pets, false);
assert.equal(parentPayload.child_special_or_medical_details, null);

assert.equal(parentShowsPartnerDateOfBirth("married"), true);
assert.equal(parentShowsWeddingAnniversary("married"), true);
assert.equal(parentShowsPartnerDateOfBirth("partnered"), true);
assert.equal(parentShowsWeddingAnniversary("partnered"), false);
for (const status of ["divorced", "widowed", "single", "separated", "prefer_not_to_say", ""]) {
  assert.equal(parentShowsPartnerDateOfBirth(status), false, status);
  assert.equal(parentShowsWeddingAnniversary(status), false, status);
}

const staleSpouseDates = {
  weddingAnniversary: "2015-06-20",
  partnerDateOfBirth: "1988-04-12"
};
assert.deepEqual(parentSpouseDateFieldsForStatus("married", staleSpouseDates), staleSpouseDates);
assert.deepEqual(parentSpouseDateFieldsForStatus("partnered", staleSpouseDates), {
  weddingAnniversary: "",
  partnerDateOfBirth: "1988-04-12"
});
assert.deepEqual(parentSpouseDateFieldsForStatus("divorced", staleSpouseDates), {
  weddingAnniversary: "",
  partnerDateOfBirth: ""
});

const marriedParent = {
  ...validParent,
  maritalStatus: "married" as const,
  weddingAnniversary: "2015-06-20",
  partnerDateOfBirth: "1988-04-12"
};
const marriedPayload = buildParentOnboardingSavePayload(marriedParent, "2026-09-02T00:00:00.000Z");
assert.equal(marriedPayload.wedding_date, "2015-06-20");
assert.equal(marriedPayload.spouse_birthday, "1988-04-12");
assert.equal(validateParentOnboardingStep(3, marriedParent), null);

const partneredParent = { ...marriedParent, maritalStatus: "partnered" as const };
const partneredPayload = buildParentOnboardingSavePayload(partneredParent, "2026-09-02T00:00:00.000Z");
assert.equal(partneredPayload.wedding_date, null);
assert.equal(partneredPayload.spouse_birthday, "1988-04-12");

for (const status of ["divorced", "widowed", "single"] as const) {
  const hiddenPayload = buildParentOnboardingSavePayload(
    { ...marriedParent, maritalStatus: status },
    "2026-09-02T00:00:00.000Z"
  );
  assert.equal(hiddenPayload.wedding_date, null, status);
  assert.equal(hiddenPayload.spouse_birthday, null, status);
  assert.equal(
    validateParentOnboardingStep(3, {
      ...marriedParent,
      maritalStatus: status,
      weddingAnniversary: "not-a-date",
      partnerDateOfBirth: "not-a-date"
    }),
    null,
    status
  );
}

assert.match(parentWizard, /parentShowsWeddingAnniversary/);
assert.match(parentWizard, /parentShowsPartnerDateOfBirth/);
assert.match(parentWizard, /parentSpouseDateFieldsForStatus/);
assert.match(parentWizard, /wedding-anniversary/);
assert.match(parentWizard, /partner-dob/);

assert.equal(validateParentOnboardingStep(2, { ...validParent, city: "" }), "יש לבחור עיר / אזור מגורים.");
assert.equal(validateParentOnboardingStep(2, validParent), null);

const medicalParent = {
  ...validParent,
  hasChildSpecialOrMedicalInformation: true,
  childSpecialOrMedicalDetails: ""
};
assert.match(validateParentOnboardingStep(5, medicalParent) ?? "", /פרטים שחשוב לדעת/);
assert.equal(
  validateParentOnboardingStep(5, { ...medicalParent, childSpecialOrMedicalDetails: "אלרגיה לבוטנים" }),
  null
);
assert.match(validateParentOnboardingStep(4, { ...validParent, childrenCount: null }) ?? "", /כמה ילדים/);
assert.equal(validateParentOnboardingStep(6, { ...validParent, preferredLanguage: "" }), "יש לבחור שפה מועדפת.");

// 12 removed matching/personality questions
for (const banned of [
  "preferred sitter",
  "גיל הבייביסיטר",
  "ניסיון מינימלי",
  "מה הכי חשוב לכם בבייביסיטר",
  "תחביבים של הילדים",
  "שגרת שינה",
  "מה מרגיע את הילד",
  "סגנון תקשורת"
]) {
  assert.doesNotMatch(parentWizard, new RegExp(banned));
}

// 13–14 parent completion + persistence mapping
assert.match(parentWizard, /buildParentOnboardingSavePayload/);
assert.match(parentWizard, /updateRowStrippingUnknownColumns/);
assert.match(parentWizard, /parent_onboarding_completed_at|buildParentOnboardingSavePayload/);
assert.match(parentWizard, /router\.replace\("\/parent\/dashboard"\)/);

// 15–18 sitter names / required note
assert.match(sitterWizard, /label="שם פרטי"/);
assert.match(sitterWizard, /label="שם משפחה"/);
assert.doesNotMatch(sitterWizard, /שם מלא|Full Name|fullName/);
assert.match(sitterWizard, /OnboardingPageShell/);
assert.match(sitterWizard, /REQUIRED_FIELDS_NOTE|OnboardingCard/);

// 19–21 preferred work area + search
assert.match(sitterWizard, /אזור עבודה מועדף/);
assert.match(sitterWizard, /preferredWorkArea/);
assert.match(sitterWizard, /updateSitterWorkingCities/);
assert.deepEqual(sitterPreferredWorkAreaFromDraft(validSitter), ["חיפה", "יקנעם עילית"]);
const sitterCore = buildSitterOnboardingCorePayload(validSitter);
assert.deepEqual(sitterCore.working_cities, ["חיפה", "יקנעם עילית"]);
assert.equal(sitterCore.home_city, "חיפה");
assert.match(searchFilters, /filters `sitter_profiles\.working_cities`/);
assert.match(latestSearch, /working_cities[\s\S]*@>\s*array\[f\.search_city\]/);
const rpc = toListPublicSittersSearchRpcArgs({
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
  selectedCity: "חיפה",
  serviceType: "babysitter"
});
assert.equal(rpc.p_search_city, "חיפה");

// 22 generic availability absent
assert.doesNotMatch(sitterWizard, /label="זמינות"|זמינות כללית/);
assert.doesNotMatch(sitterWizard, /generic availability/);

// 23–25 structured experience, hours, yes/no
assert.equal(yearsExperienceFromBand("3"), 3);
assert.equal(yearsExperienceFromBand("none"), 0);
assert.equal(sitterCore.years_experience, 3);
assert.equal(sitterCore.years_experience_band, "3");
assert.equal(parseDesiredHoursPerWeek("10"), 10);
assert.equal(parseDesiredHoursPerWeek("0"), null);
assert.equal(parseDesiredHoursPerWeek("51"), null);
assert.equal(parseSitterHourlyRate("55"), 55);
assert.match(sitterWizard, /OnboardingYesNo/);
assert.doesNotMatch(sitterWizard, /id="hasCarCheck"/);
const unanswered = buildSitterOnboardingExtendedPayload(emptySitterOnboardingDraft());
assert.equal(unanswered.accepts_short_notice_shifts, null);
assert.equal(unanswered.has_special_needs_experience, null);

// 26–27 removed interview / special skills
for (const banned of [
  "כישורים מיוחדים",
  "ספרי קצת על עצמך",
  "למה את אוהבת לעבוד עם ילדים",
  "מה הורים בדרך כלל מעריכים בך",
  "מה את אוהבת לעשות עם ילדים",
  "מה חשוב לך ממשפחה",
  "איזה סוג משמרות פחות מתאים"
]) {
  assert.doesNotMatch(sitterWizard, new RegExp(banned));
}

// 28–29 sitter completion + persistence
assert.equal(validateSitterOnboardingRequiredFields(validSitter), null);
assert.equal(validateSitterOnboardingStep(1, emptySitterOnboardingDraft()), "יש להזין שם פרטי.");
assert.match(sitterWizard, /buildSitterOnboardingCorePayload/);
assert.match(sitterWizard, /onboarding_completed_at/);
assert.match(sitterWizard, /router\.replace\("\/sitter\/dashboard"\)/);

// 30–34 shared UI
assert.match(parentWizard, /OnboardingPageShell/);
assert.match(parentWizard, /OnboardingCard/);
assert.match(sitterWizard, /OnboardingPageShell/);
assert.match(sitterWizard, /OnboardingCard/);
assert.match(shell, /שלב \{step\} מתוך \{totalSteps\}/);
assert.match(parentWizard, /ONBOARDING_STEP_COUNT/);
assert.match(sitterWizard, /ONBOARDING_STEP_COUNT/);
assert.match(shell, /overflow-hidden/);
assert.match(shell, /min-w-0/);
assert.match(shell, /safe-area-inset-bottom/);
assert.match(parentWizard, /onBack=\{goBack\}/);
assert.match(sitterWizard, /onBack=\{goBack\}/);
assert.match(parentWizard, /useState<ParentOnboardingDraft>/);
assert.match(sitterWizard, /useState<SitterOnboardingDraft>/);

// Migration / privacy / no public leak
assert.match(migration, /child_special_or_medical_details/);
assert.match(migration, /Never expose publicly/);
assert.match(migration, /working_cities/);
assert.match(migration, /desired_hours_per_week/);
assert.match(migration, /sitter_profiles_desired_hours_per_week_chk/);
assert.match(migration, /No new public SELECT policies/);
assert.doesNotMatch(migration, /drop policy|grant select on table public.profiles to anon/);
assert.ok(ISRAEL_CITIES.includes("חיפה"));
assert.ok(ISRAEL_CITIES.includes("יקנעם עילית"));

const parentPersonal = read("components/parent/parent-personal-area.tsx");
const sitterPersonal = read("components/sitter/sitter-personal-area.tsx");
assert.match(parentPersonal, /preferred_language/);
assert.match(parentPersonal, /buildParentProfileUpdatePayload/);
assert.match(sitterPersonal, /working_cities/);
assert.match(sitterPersonal, /home_city/);
assert.doesNotMatch(sitterPersonal, /generic availability/);

console.log("onboarding-questionnaires: ok");
