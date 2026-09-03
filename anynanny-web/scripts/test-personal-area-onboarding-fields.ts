import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildParentOnboardingSavePayload,
  emptyParentOnboardingDraft,
  childBlocksForCount
} from "../lib/onboarding/parent-questionnaire";
import {
  buildSitterOnboardingCorePayload,
  buildSitterOnboardingExtendedPayload,
  emptySitterOnboardingDraft,
  pickSitterQuestionnairePutFields,
  type SitterOnboardingDraft
} from "../lib/onboarding/sitter-questionnaire";
import {
  buildParentProfileUpdatePayload,
  parseParentProfileRow
} from "../lib/parent/parent-profile";
import { SITTER_PROFILE_OWN_SELECT_COLUMNS, SITTER_PROFILE_PUT_COLUMNS } from "../lib/sitter/sitter-profile";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const parentPersonal = read("components/parent/parent-personal-area.tsx");
const sitterPersonal = read("components/sitter/sitter-personal-area.tsx");
const parentProfile = read("lib/parent/parent-profile.ts");
const publicProfile = read("lib/sitter/fetch-parent-sitter-profile.ts");
const publicSearch = read("lib/sitter/parent-sitter-search.ts");
const publicApi = read("app/api/parent/sitter/[id]/public/route.ts");
const parentPreview = read("components/sitter/sitter-parent-profile-preview.tsx");

const parentPayload = buildParentOnboardingSavePayload({
  ...emptyParentOnboardingDraft(),
  firstName: "נועה",
  lastName: "לוי",
  birthDate: "1990-01-15",
  city: "חיפה",
  preferredLanguage: "עברית",
  childrenCount: 1,
  children: childBlocksForCount(1, []).map((child) => ({
    ...child,
    name: "עומר",
    birthDate: "2018-03-02"
  })),
  hasPets: true,
  petDetails: "כלב",
  hasChildSpecialOrMedicalInformation: true,
  childSpecialOrMedicalDetails: "אלרגיה לבוטנים",
  reminderPreferences: ["birthdays"],
  typicalReasons: ["work"]
});

const parentRow = parseParentProfileRow(
  {
    id: "parent-1",
    ...parentPayload
  },
  "parent-1"
);

// 1. new Parent onboarding fields appear in Personal Area
for (const field of [
  "preferred_language",
  "has_pets",
  "child_special_or_medical_details",
  "typical_babysitting_need",
  "reminder_preferences",
  "automatic_babysitter_suggestion"
]) {
  assert.match(parentPersonal, new RegExp(field));
  assert.match(parentProfile, new RegExp(field));
}
assert.match(parentPersonal, /מידע חשוב למשמרת/);
assert.match(parentPersonal, /העדפות ותזכורות/);
assert.match(parentPersonal, /שפה מועדפת/);

// 2. missing optional fields show a safe empty state
assert.match(parentPersonal, /emptyLabel = "לא הוגדר"|לא הוגדר/);
assert.equal(parseParentProfileRow(null, "legacy").has_pets, null);
assert.equal(parseParentProfileRow({}, "legacy").preferred_language, "");
assert.equal(parseParentProfileRow({ children: null }, "legacy").children.length, 0);

// 3–4. Parent can update the same Supabase fields
const updated = buildParentProfileUpdatePayload({
  ...parentRow,
  preferred_language: "אנגלית",
  has_pets: false,
  pet_details: "ignored"
});
assert.equal(updated.preferred_language, "אנגלית");
assert.equal(updated.has_pets, false);
assert.equal(updated.pet_details, null);
assert.equal(parentPayload.preferred_language, "עברית");
assert.ok("preferred_language" in parentPayload && "preferred_language" in updated);
assert.ok("has_child_special_or_medical_information" in parentPayload);
assert.equal(updated.child_special_or_medical_details, "אלרגיה לבוטנים");

// 5. child information remains editable
assert.match(parentPersonal, /editKey === "children"/);
assert.equal(parentRow.children[0]?.name, "עומר");
assert.equal(updated.children_count, 1);

// 6–7. sensitive / reminder fields stay private
for (const source of [publicProfile, publicSearch, publicApi, parentPreview]) {
  assert.doesNotMatch(source, /child_special_or_medical/);
  assert.doesNotMatch(source, /has_pets/);
  assert.doesNotMatch(source, /reminder_preferences/);
  assert.doesNotMatch(source, /typical_reasons/);
  assert.doesNotMatch(source, /automatic_babysitter_suggestion/);
}
assert.match(parentPersonal, /לא מוצג בפרופיל הציבורי/);

// 8. new Sitter onboarding fields appear in Personal Area
for (const field of [
  "home_city",
  "desired_hours_per_week",
  "working_cities",
  "has_drivers_license",
  "has_baby_experience",
  "work_type_preferences",
  "task_capabilities"
]) {
  assert.match(sitterPersonal, new RegExp(field));
  assert.ok((SITTER_PROFILE_OWN_SELECT_COLUMNS as readonly string[]).includes(field) || field === "working_cities");
}
assert.match(sitterPersonal, /אזור עבודה מועדף/);
assert.match(sitterPersonal, /יכולות והתאמה/);
assert.match(sitterPersonal, /העדפות עבודה/);

// 9–10. preferred work area is editable and search-backed
assert.match(sitterPersonal, /editKey === "working_cities"/);
assert.match(sitterPersonal, /IsraelCitiesMultiSelect/);
assert.match(sitterPersonal, /working_cities: form.working_cities/);
assert.ok((SITTER_PROFILE_PUT_COLUMNS as readonly string[]).includes("working_cities"));
assert.ok((SITTER_PROFILE_PUT_COLUMNS as readonly string[]).includes("home_city"));

// 11–13. hours / preferences / yes-no editable
assert.match(sitterPersonal, /desired_hours_per_week/);
assert.match(sitterPersonal, /SITTER_DESIRED_HOURS_MAX/);
assert.match(sitterPersonal, /OnboardingYesNo/);
assert.match(sitterPersonal, /OnboardingChips/);
assert.match(sitterPersonal, /parseDesiredHoursPerWeek/);

// 14. removed availability field does not return
assert.doesNotMatch(sitterPersonal, /זמינות כללית|generic availability|availability_notes/);

// 15. onboarding and Personal Area share the same data model
const sitterDraft: SitterOnboardingDraft = {
  ...emptySitterOnboardingDraft(),
  firstName: "יעל",
  lastName: "כהן",
  birthDate: "2002-04-10",
  homeCity: "חיפה",
  preferredWorkArea: ["חיפה"],
  languages: ["עברית"],
  yearsExperienceBand: "3",
  experienceAgeGroups: ["toddlers"],
  hourlyRateNis: "55",
  desiredHoursPerWeek: "12"
};
const sitterCore = buildSitterOnboardingCorePayload(sitterDraft);
const sitterExt = buildSitterOnboardingExtendedPayload(sitterDraft);
assert.equal(sitterCore.home_city, "חיפה");
assert.deepEqual(sitterCore.working_cities, ["חיפה"]);
assert.equal(sitterExt.desired_hours_per_week, 12);
const putFields = pickSitterQuestionnairePutFields(
  { ...sitterCore, ...sitterExt },
  {}
);
assert.equal(putFields.home_city, "חיפה");
assert.equal(putFields.desired_hours_per_week, 12);

// 16. structured controls remain structured
assert.match(parentPersonal, /OnboardingYesNo/);
assert.match(parentPersonal, /OnboardingChips/);
assert.match(parentPersonal, /OnboardingSelect/);
assert.match(sitterPersonal, /SITTER_EXPERIENCE_BAND_OPTIONS/);
assert.doesNotMatch(sitterPersonal, /id="hasCarCheck"/);

// 17. legacy NULL values do not break rendering
assert.doesNotMatch(parentPersonal, /form.has_pets === false \? "לא" : form.has_pets/);
assert.match(parentPersonal, /yesNoLabel\(form.has_pets\)/);
assert.match(sitterPersonal, /yesNoLabel\(form.has_drivers_license\)/);

console.log("test-personal-area-onboarding-fields: PASS");
