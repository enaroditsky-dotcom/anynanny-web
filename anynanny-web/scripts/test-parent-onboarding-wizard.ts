import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildParentOnboardingSavePayload,
  childBlocksForCount,
  emptyParentOnboardingDraft,
  firstInvalidParentOnboardingFieldId,
  PARENT_QUESTIONNAIRE_STEP_COUNT,
  PARENT_QUESTIONNAIRE_STEP_TITLES,
  parentQuestionnaireProgressLabel,
  parentQuestionnaireStepForRequiredError,
  validateParentOnboardingRequiredFields,
  validateParentOnboardingStep,
  type ParentOnboardingDraft
} from "../lib/onboarding/parent-questionnaire";
import {
  parentShowsPartnerDateOfBirth,
  parentShowsWeddingAnniversary,
  parentSpouseDateFieldsForStatus
} from "../lib/onboarding/parent-options";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const wizard = read("components/parent/parent-onboarding-wizard.tsx");
const shell = read("components/onboarding/onboarding-shell.tsx");
const personal = read("components/parent/parent-personal-area.tsx");
const parentProfile = read("lib/parent/parent-profile.ts");

const validDraft: ParentOnboardingDraft = {
  ...emptyParentOnboardingDraft(),
  firstName: "נועה",
  lastName: "לוי",
  birthDate: "1990-01-15",
  city: "חיפה",
  street: "הרצל",
  houseNumber: "12",
  preferredLanguage: "עברית",
  childrenCount: 1,
  children: childBlocksForCount(1, []).map((child) => ({
    ...child,
    name: "עומר",
    birthDate: "2019-02-02"
  })),
  hasPets: false,
  hasChildSpecialOrMedicalInformation: false
};

function withStatus(
  status: ParentOnboardingDraft["maritalStatus"],
  extra: Partial<ParentOnboardingDraft> = {}
): ParentOnboardingDraft {
  const dates = parentSpouseDateFieldsForStatus(status, {
    weddingAnniversary: extra.weddingAnniversary ?? "2015-06-20",
    partnerDateOfBirth: extra.partnerDateOfBirth ?? "1988-04-12"
  });
  return {
    ...validDraft,
    ...extra,
    maritalStatus: status,
    weddingAnniversary: dates.weddingAnniversary,
    partnerDateOfBirth: dates.partnerDateOfBirth
  };
}

// 1. First step renders as 1/7
assert.equal(PARENT_QUESTIONNAIRE_STEP_COUNT, 7);
assert.equal(parentQuestionnaireProgressLabel(1), "1/7");
assert.equal(PARENT_QUESTIONNAIRE_STEP_TITLES[1], "קצת עליך");
assert.match(wizard, /useState<ParentQuestionnaireStep>\(1\)/);
assert.match(wizard, /current: questionnaireStep, total: PARENT_QUESTIONNAIRE_STEP_COUNT/);
assert.match(shell, /innerProgress\.current\}\/\{innerProgress\.total/);

// 2–3. Next advances to 2/7, Back returns to 1/7
assert.equal(parentQuestionnaireProgressLabel(2), "2/7");
assert.equal(parentQuestionnaireProgressLabel(7), "7/7");
assert.match(wizard, /setQuestionnaireStep\(\(prev\) => \(prev \+ 1\)/);
assert.match(wizard, /setQuestionnaireStep\(\(prev\) => \(prev - 1\)/);
assert.match(wizard, /showBack=\{questionnaireStep > 1\}/);
assert.equal(validateParentOnboardingStep(1, validDraft), null);
assert.notEqual(validateParentOnboardingStep(1, emptyParentOnboardingDraft()), null);

// 4. Form data survives forward/back navigation
const surviving = { ...validDraft, firstName: "נועה", city: "חיפה" };
assert.equal(validateParentOnboardingStep(1, surviving), null);
assert.equal(validateParentOnboardingStep(2, surviving), null);
assert.equal(surviving.firstName, "נועה");
assert.equal(surviving.city, "חיפה");
const goBackSource = wizard.slice(wizard.indexOf("const goBack"), wizard.indexOf("const handleFinish"));
assert.doesNotMatch(goBackSource, /setDraft\(|emptyParentOnboardingDraft|handleFinish|updateRowStrippingUnknownColumns/);
assert.match(wizard, /useState<ParentOnboardingDraft>/);

// 5. Required invalid fields block advancement
assert.equal(validateParentOnboardingStep(1, emptyParentOnboardingDraft()), "יש להזין שם פרטי.");
assert.equal(firstInvalidParentOnboardingFieldId(1, emptyParentOnboardingDraft()), "parent-first-name");
assert.equal(
  validateParentOnboardingStep(1, { ...emptyParentOnboardingDraft(), firstName: "נועה", lastName: "לוי" }),
  "יש להזין תאריך לידה."
);
assert.equal(validateParentOnboardingStep(2, { ...validDraft, city: "" }), "יש לבחור עיר / אזור מגורים.");
assert.match(wizard, /validateParentOnboardingStep\(questionnaireStep, draft\)/);
assert.match(wizard, /firstInvalidParentOnboardingFieldId/);

// 6. Married shows partner birth date + wedding date
assert.equal(parentShowsPartnerDateOfBirth("married"), true);
assert.equal(parentShowsWeddingAnniversary("married"), true);
const married = withStatus("married");
const marriedPayload = buildParentOnboardingSavePayload(married, "2026-09-15T00:00:00.000Z");
assert.equal(marriedPayload.wedding_date, "2015-06-20");
assert.equal(marriedPayload.spouse_birthday, "1988-04-12");
assert.match(wizard, /parentShowsWeddingAnniversary\(draft\.maritalStatus\)/);
assert.match(wizard, /parentShowsPartnerDateOfBirth\(draft\.maritalStatus\)/);

// 7. Partnered shows partner birth date but no wedding date
assert.equal(parentShowsPartnerDateOfBirth("partnered"), true);
assert.equal(parentShowsWeddingAnniversary("partnered"), false);
const partneredPayload = buildParentOnboardingSavePayload(withStatus("partnered"), "2026-09-15T00:00:00.000Z");
assert.equal(partneredPayload.wedding_date, null);
assert.equal(partneredPayload.spouse_birthday, "1988-04-12");

// 8–11. Hidden statuses clear both date fields, including separated stored data
for (const status of ["divorced", "widowed", "single", "separated", "prefer_not_to_say", ""] as const) {
  assert.equal(parentShowsPartnerDateOfBirth(status), false, status);
  assert.equal(parentShowsWeddingAnniversary(status), false, status);
  assert.deepEqual(
    parentSpouseDateFieldsForStatus(status, {
      weddingAnniversary: "2015-06-20",
      partnerDateOfBirth: "1988-04-12"
    }),
    { weddingAnniversary: "", partnerDateOfBirth: "" },
    status
  );
}

for (const status of ["divorced", "widowed", "single"] as const) {
  const hiddenPayload = buildParentOnboardingSavePayload(withStatus(status), "2026-09-15T00:00:00.000Z");
  assert.equal(hiddenPayload.wedding_date, null, status);
  assert.equal(hiddenPayload.spouse_birthday, null, status);
}

const separatedDates = parentSpouseDateFieldsForStatus("separated", {
  weddingAnniversary: "2015-06-20",
  partnerDateOfBirth: "1988-04-12"
});
const separatedPayload = buildParentOnboardingSavePayload(
  {
    ...validDraft,
    maritalStatus: "",
    weddingAnniversary: separatedDates.weddingAnniversary,
    partnerDateOfBirth: separatedDates.partnerDateOfBirth
  },
  "2026-09-15T00:00:00.000Z"
);
assert.equal(separatedPayload.wedding_date, null);
assert.equal(separatedPayload.spouse_birthday, null);
assert.match(wizard, /parentSpouseDateFieldsForStatus\(nextStatus/);

// 12–13. Children remain required; 6+ add still exists
assert.equal(childBlocksForCount(1, []).length, 1);
assert.match(validateParentOnboardingStep(4, { ...validDraft, childrenCount: null, children: [] }) ?? "", /כמה ילדים/);
assert.equal(validateParentOnboardingStep(4, validDraft), null);
const emptyChildrenPayload = buildParentOnboardingSavePayload({
  ...validDraft,
  childrenCount: null,
  children: []
});
assert.equal(emptyChildrenPayload.children_count, 1);
assert.equal((emptyChildrenPayload.children as unknown[]).length, 1);
assert.match(wizard, /הוספת ילד\/ה/);
assert.match(wizard, /PARENT_CHILDREN_COUNT_OPTIONS/);

// 14. Special events step can be completed empty
assert.equal(validateParentOnboardingStep(7, { ...validDraft, specialDates: [] }), null);
assert.equal(validateParentOnboardingRequiredFields({ ...validDraft, specialDates: [] }), null);
assert.deepEqual(buildParentOnboardingSavePayload({ ...validDraft, specialDates: [] }).special_events, []);
assert.match(wizard, /הוספת תאריך/);
assert.equal(PARENT_QUESTIONNAIRE_STEP_TITLES[7], "תזכורות ותאריכים");

// 15. Final submission preserves the existing payload shape
const payload = buildParentOnboardingSavePayload(validDraft, "2026-09-15T00:00:00.000Z");
for (const key of [
  "birth_date",
  "city",
  "address",
  "phone",
  "children_count",
  "children",
  "preferred_language",
  "typical_babysitting_need",
  "has_pets",
  "pet_details",
  "has_child_special_or_medical_information",
  "child_special_or_medical_details",
  "marital_status",
  "wedding_date",
  "spouse_birthday",
  "special_events",
  "estimated_babysitter_frequency",
  "typical_reasons",
  "typical_reasons_other",
  "reminder_preferences",
  "automatic_babysitter_suggestion",
  "parent_onboarding_completed_at"
]) {
  assert.ok(key in payload, key);
}
assert.equal(payload.first_name, "נועה");
assert.equal(payload.last_name, "לוי");
assert.equal((payload.address as { city: string; street: string; houseNumber: string }).street, "הרצל");
assert.equal((payload.address as { houseNumber: string }).houseNumber, "12");
assert.equal(payload.parent_onboarding_completed_at, "2026-09-15T00:00:00.000Z");

// 16. Existing onboarding completion behavior remains unchanged
assert.match(wizard, /buildParentOnboardingSavePayload/);
assert.match(wizard, /updateRowStrippingUnknownColumns/);
assert.match(wizard, /parent_onboarding_completed_at|buildParentOnboardingSavePayload/);
assert.match(wizard, /router\.replace\("\/parent\/dashboard"\)/);
assert.match(wizard, /IdentityOnboardingCard/);
assert.match(wizard, /continueLabel="סיום"/);
assert.match(wizard, /setShowIdentity\(true\)/);
assert.equal(parentQuestionnaireStepForRequiredError("יש לבחור עיר / אזור מגורים."), 2);
assert.equal(parentQuestionnaireStepForRequiredError("יש להזין שם פרטי."), 1);
assert.equal(parentQuestionnaireStepForRequiredError("יש לבחור שפה מועדפת."), 6);
assert.equal(parentQuestionnaireStepForRequiredError("יש לבחור האם יש בעלי חיים בבית."), 5);

assert.equal(validateParentOnboardingStep(6, { ...validDraft, preferredLanguage: "" }), "יש לבחור שפה מועדפת.");
assert.equal(validateParentOnboardingStep(5, { ...validDraft, hasPets: null }), "יש לבחור האם יש בעלי חיים בבית.");
assert.equal(
  validateParentOnboardingRequiredFields({ ...validDraft, preferredLanguage: "" }),
  "יש לבחור שפה מועדפת."
);

for (const field of [
  'label="מספר טלפון"',
  'label="שפה מועדפת"',
  "האם יש בעלי חיים בבית",
  "פרטים שחשוב לדעת",
  "מתי בדרך כלל אתם עשויים להזדקק לבייביסיטר",
  "באיזו תדירות",
  "לאילו צרכים",
  "על אילו אירועים תרצו ש-AnyNanny תזכיר",
  "automaticBabysitterSuggestion"
]) {
  assert.match(wizard, new RegExp(field));
}

// 17. Parent Personal Area behavior remains unaffected
assert.match(personal, /parentShowsWeddingAnniversary/);
assert.match(personal, /parentShowsPartnerDateOfBirth/);
assert.match(personal, /parentSpouseDateFieldsForStatus/);
assert.match(personal, /buildParentProfileUpdatePayload/);
assert.match(parentProfile, /sanitizeParentProfileSpouseDates/);
assert.doesNotMatch(personal, /PARENT_QUESTIONNAIRE_STEP_COUNT|questionnaireStep/);

// Animation + inner progress, no competing outer label during questionnaire
assert.match(wizard, /animate-parent-wizard-in-forward/);
assert.match(wizard, /animate-parent-wizard-out-forward/);
assert.match(wizard, /animate-parent-wizard-in-back/);
assert.match(wizard, /animate-parent-wizard-out-back/);
assert.match(wizard, /prefers-reduced-motion/);
assert.match(wizard, /showStageLabel=\{showIdentity\}/);
assert.match(wizard, /growContent/);
assert.match(shell, /growContent \? "" : "min-h-0 flex-1 overflow-y-auto/);

console.log("parent-onboarding-wizard: ok");
