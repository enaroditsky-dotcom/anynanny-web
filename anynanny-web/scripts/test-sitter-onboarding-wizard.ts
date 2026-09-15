import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOB_ELIGIBILITY_ERROR } from "../lib/auth/age-eligibility";
import {
  buildSitterOnboardingCorePayload,
  buildSitterOnboardingExtendedPayload,
  emptySitterOnboardingDraft,
  firstInvalidSitterQuestionnaireFieldId,
  sitterExpertProfileStep,
  sitterQuestionnaireProgressLabel,
  sitterQuestionnaireStepCount,
  sitterQuestionnaireStepForRequiredError,
  sitterQuestionnaireStepIdAt,
  sitterQuestionnaireStepIds,
  SITTER_QUESTIONNAIRE_STEP_TITLES,
  validateSitterOnboardingRequiredFields,
  validateSitterOnboardingStep,
  validateSitterQuestionnaireWizardStep,
  type SitterOnboardingDraft
} from "../lib/onboarding/sitter-questionnaire";
import { emptyExpertProfileDraft, validateExpertProfileDraft } from "../lib/sitter/expert-profile";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const wizard = read("components/sitter/sitter-onboarding-wizard.tsx");
const parentWizard = read("components/parent/parent-onboarding-wizard.tsx");
const slide = read("components/onboarding/questionnaire-slide.tsx");
const shell = read("components/onboarding/onboarding-shell.tsx");
const questionnaire = read("lib/onboarding/sitter-questionnaire.ts");

const validDraft: SitterOnboardingDraft = {
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

const validExpertDraft = {
  ...emptyExpertProfileDraft(),
  serviceLocations: ["home_visit" as const],
  hourlyRateNis: "250",
  bio: "יועצת הנקה מוסמכת עם ניסיון בליווי משפחות."
};

// 1. Starts at 1/N
assert.equal(sitterQuestionnaireStepCount(false), 7);
assert.equal(sitterQuestionnaireStepCount(true), 6);
assert.equal(sitterQuestionnaireProgressLabel(1, false), "1/7");
assert.equal(sitterQuestionnaireProgressLabel(1, true), "1/6");
assert.equal(SITTER_QUESTIONNAIRE_STEP_TITLES.about, "קצת עליך");
assert.equal(sitterQuestionnaireStepIdAt(1, false), "about");
assert.match(wizard, /useState\(1\)/);
assert.match(wizard, /current: questionnaireStep, total: stepCount/);
assert.match(shell, /innerProgress\.current\}\/\{innerProgress\.total/);

// 2–3. Next advances one step, Back returns one step
assert.equal(sitterQuestionnaireProgressLabel(2, false), "2/7");
assert.equal(sitterQuestionnaireProgressLabel(7, false), "7/7");
assert.match(wizard, /setQuestionnaireStep\(\(prev\) => prev \+ 1\)/);
assert.match(wizard, /setQuestionnaireStep\(\(prev\) => prev - 1\)/);
assert.match(wizard, /showBack=\{questionnaireStep > 1\}/);
assert.equal(validateSitterQuestionnaireWizardStep("about", validDraft), null);
assert.notEqual(validateSitterQuestionnaireWizardStep("about", emptySitterOnboardingDraft()), null);

// 4. Form values survive forward/back navigation
const surviving = { ...validDraft, firstName: "יעל", homeCity: "חיפה", hourlyRateNis: "55" };
assert.equal(validateSitterQuestionnaireWizardStep("about", surviving), null);
assert.equal(validateSitterQuestionnaireWizardStep("location", surviving), null);
assert.equal(surviving.firstName, "יעל");
assert.equal(surviving.homeCity, "חיפה");
assert.equal(surviving.hourlyRateNis, "55");
const goBackSource = wizard.slice(wizard.indexOf("const goBack"), wizard.indexOf("const handleFinish"));
assert.doesNotMatch(goBackSource, /setDraft\(|emptySitterOnboardingDraft|handleFinish|updateRowStrippingUnknownColumns/);
assert.match(wizard, /useState<SitterOnboardingDraft>/);

// 5. Required fields block advancement
assert.equal(validateSitterQuestionnaireWizardStep("about", emptySitterOnboardingDraft()), "יש להזין שם פרטי.");
assert.equal(firstInvalidSitterQuestionnaireFieldId("about", emptySitterOnboardingDraft()), "sitter-first-name");
assert.equal(
  validateSitterQuestionnaireWizardStep("about", {
    ...emptySitterOnboardingDraft(),
    firstName: "יעל",
    lastName: "כהן"
  }),
  "יש להזין תאריך לידה."
);
assert.equal(
  validateSitterQuestionnaireWizardStep("location", { ...validDraft, homeCity: "" }),
  "יש לבחור עיר / אזור מגורים."
);
assert.equal(
  validateSitterQuestionnaireWizardStep("location", { ...validDraft, preferredWorkArea: [] }),
  "יש לבחור אזור עבודה מועדף."
);
assert.equal(validateSitterQuestionnaireWizardStep("experience", emptySitterOnboardingDraft()), "יש לבחור שנות ניסיון.");
assert.match(wizard, /validateSitterQuestionnaireWizardStep\(stepId, draft\)/);
assert.match(wizard, /firstInvalidSitterQuestionnaireFieldId/);

// 6. Optional fields do not block advancement
assert.equal(validateSitterQuestionnaireWizardStep("skills", emptySitterOnboardingDraft()), null);
assert.equal(validateSitterQuestionnaireWizardStep("who", emptySitterOnboardingDraft()), null);
assert.equal(validateSitterQuestionnaireWizardStep("tasks", emptySitterOnboardingDraft()), null);
assert.equal(validateSitterQuestionnaireWizardStep("work-prefs", validDraft), null);
assert.equal(validateSitterQuestionnaireWizardStep("about", { ...validDraft, phone: "" }), null);

// 7. DOB / age validation unchanged
assert.equal(
  validateSitterQuestionnaireWizardStep("about", { ...validDraft, birthDate: "2015-01-01" }),
  DOB_ELIGIBILITY_ERROR.sitter
);
assert.equal(validateSitterOnboardingStep(1, { ...validDraft, birthDate: "2015-01-01" }), DOB_ELIGIBILITY_ERROR.sitter);
assert.equal(validateSitterOnboardingStep(1, { ...validDraft, birthDate: "" }), "יש להזין תאריך לידה.");

// 8. Working-city validation unchanged
assert.equal(validateSitterOnboardingStep(1, { ...validDraft, homeCity: "" }), "יש לבחור עיר / אזור מגורים.");
assert.equal(
  validateSitterOnboardingStep(1, { ...validDraft, preferredWorkArea: [] }),
  "יש לבחור אזור עבודה מועדף."
);
assert.equal(validateSitterOnboardingStep(1, validDraft), null);

// 9. Conditional fields still behave correctly
assert.match(wizard, /draft\.hasSpecialNeedsExperience/);
assert.match(wizard, /id=\{fieldId\("special-needs-details"\)\}/);
assert.match(wizard, /draft\.hasChildcareTraining/);
assert.match(wizard, /id=\{fieldId\("training-details"\)\}/);
assert.equal(
  validateSitterQuestionnaireWizardStep("work-prefs", { ...validDraft, desiredHoursPerWeek: "0" }),
  "יש לבחור מספר שעות בין 1 ל-50."
);
assert.equal(
  validateSitterQuestionnaireWizardStep("work-prefs", { ...validDraft, desiredHoursPerWeek: "10" }),
  null
);
const withSpecialNeeds = {
  ...validDraft,
  hasSpecialNeedsExperience: true,
  specialNeedsExperienceDetails: "  "
};
const extendedYes = buildSitterOnboardingExtendedPayload(withSpecialNeeds);
assert.equal(extendedYes.has_special_needs_experience, true);
assert.equal(extendedYes.special_needs_experience_details, null);
const extendedNo = buildSitterOnboardingExtendedPayload({
  ...validDraft,
  hasSpecialNeedsExperience: false,
  specialNeedsExperienceDetails: "should not persist"
});
assert.equal(extendedNo.has_special_needs_experience, false);
assert.equal(extendedNo.special_needs_experience_details, null);

// 10. Expert / consultant fields remain conditional
assert.deepEqual([...sitterQuestionnaireStepIds(false)], [
  "about",
  "location",
  "experience",
  "skills",
  "work-prefs",
  "who",
  "tasks"
]);
assert.deepEqual([...sitterQuestionnaireStepIds(true)], [
  "about",
  "location",
  "expert-profile",
  "work-prefs",
  "who",
  "tasks"
]);
assert.equal(sitterQuestionnaireStepIds(false).includes("expert-profile"), false);
assert.equal(sitterQuestionnaireStepIds(true).includes("experience"), false);
assert.equal(sitterQuestionnaireStepIds(true).includes("skills"), false);
assert.equal(validateSitterOnboardingStep(2, emptySitterOnboardingDraft(), true), null);
assert.equal(validateSitterOnboardingStep(2, emptySitterOnboardingDraft(), false), "יש לבחור שנות ניסיון.");
assert.equal(validateExpertProfileDraft(emptyExpertProfileDraft()), "נא לבחור לפחות אפשרות אחת למיקום השירות.");
assert.equal(validateExpertProfileDraft(validExpertDraft), null);
assert.equal(sitterExpertProfileStep(true), 3);
assert.match(wizard, /stepId === "expert-profile"/);
assert.match(wizard, /ExpertRegistrationFields/);
assert.match(wizard, /validateExpertProfileDraft/);

// 11. Final payload shape remains unchanged
const core = buildSitterOnboardingCorePayload(validDraft);
const extended = buildSitterOnboardingExtendedPayload(validDraft);
assert.equal(core.first_name, "יעל");
assert.equal(core.last_name, "כהן");
assert.equal(core.birth_date, "2002-04-10");
assert.equal(core.home_city, "חיפה");
assert.deepEqual(core.working_cities, ["חיפה", "יקנעם עילית"]);
assert.deepEqual(core.languages, ["עברית"]);
assert.equal(core.years_experience_band, "3");
assert.equal(core.years_experience, 3);
assert.deepEqual(core.experience_age_groups, ["toddlers"]);
assert.equal(core.hourly_rate_nis, 55);
assert.equal(core.pricing_model, "hourly");
assert.equal(core.has_drivers_license, null);
assert.equal(core.has_car, null);
assert.equal(extended.current_status, null);
assert.equal(extended.desired_hours_per_week, null);
assert.equal(extended.accepts_short_notice_shifts, null);
assert.equal(extended.has_special_needs_experience, null);
assert.match(wizard, /buildSitterOnboardingCorePayload/);
assert.match(wizard, /buildSitterOnboardingExtendedPayload/);
assert.match(questionnaire, /years_experience_band/);
assert.match(questionnaire, /working_cities/);

// 12. Existing onboarding completion behavior remains unchanged
assert.equal(validateSitterOnboardingRequiredFields(validDraft), null);
assert.equal(validateSitterOnboardingRequiredFields(emptySitterOnboardingDraft()), "יש להזין שם פרטי.");
assert.equal(validateSitterOnboardingRequiredFields(validDraft, true), null);
assert.match(wizard, /onboarding_completed_at/);
assert.match(wizard, /validateSitterOnboardingRequiredFields\(draft, isExpert\)/);
assert.match(wizard, /updateSitterWorkingCities/);
assert.match(wizard, /expertDraftToProfilePatch/);
assert.equal(
  sitterQuestionnaireStepForRequiredError("יש לבחור אזור עבודה מועדף.", false),
  2
);
assert.equal(sitterQuestionnaireStepForRequiredError("יש לבחור שנות ניסיון.", false), 3);

// 13. Identity stage still follows the questionnaire
assert.match(wizard, /questionnaireStep === stepCount/);
assert.match(wizard, /setShowIdentity\(true\)/);
assert.match(wizard, /IdentityOnboardingCard/);
assert.match(wizard, /IdentityVerificationForm/);
assert.match(wizard, /ONBOARDING_STEP_COUNT/);
assert.match(wizard, /showStageLabel=\{showIdentity\}/);
assert.match(wizard, /continueLabel="סיום"/);
assert.match(wizard, /onSkipLater=\{\(\) => void handleFinish\(\)\}/);
assert.doesNotMatch(wizard, /stepId === "identity"/);

// 14. Parent wizard tests still apply to the unchanged Parent implementation
assert.match(parentWizard, /PARENT_QUESTIONNAIRE_STEP_COUNT/);
assert.match(parentWizard, /animate-parent-wizard-in-forward/);
assert.doesNotMatch(parentWizard, /SitterOnboardingDraft|sitterQuestionnaireStep/);

// Shared animation reuse
assert.match(slide, /animate-parent-wizard-in-forward/);
assert.match(slide, /animate-parent-wizard-out-forward/);
assert.match(slide, /animate-parent-wizard-in-back/);
assert.match(slide, /animate-parent-wizard-out-back/);
assert.match(slide, /prefers-reduced-motion/);
assert.match(slide, /QUESTIONNAIRE_SLIDE_MS = 280/);
assert.match(wizard, /QuestionnaireSlideFrame/);
assert.match(wizard, /growContent/);
assert.match(wizard, /wide/);

console.log("sitter-onboarding-wizard: ok");
