import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { coalesceSignupNames } from "../lib/auth/signup-names";
import { ISRAEL_CITIES, isIsraelCity } from "../lib/geo/israel-cities";
import {
  buildParentOnboardingSavePayload,
  childBlocksForCount,
  emptyParentOnboardingDraft,
  parentOnboardingNamePatch,
  validateParentOnboardingRequiredFields
} from "../lib/onboarding/parent-questionnaire";
import { normalizeParentSearchFilters } from "../lib/sitter/parent-search-filters";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const wizard = read("components/parent/parent-onboarding-wizard.tsx");
const multiSelect = read("components/geo/israel-cities-multi-select.tsx");
const autocomplete = read("components/geo/city-autocomplete.tsx");
const searchFilters = read("components/parent/parent-search-filters.tsx");

const yokneamMatches = ISRAEL_CITIES.filter((city) => city.includes("יקנעם") || city.includes("יוקנעם"));
assert.equal(yokneamMatches.length, 1, "search/onboarding must share exactly one Yokneam spelling");
const CANONICAL_YOKNEAM = yokneamMatches[0];
assert.equal(CANONICAL_YOKNEAM, "יקנעם עילית");
assert.ok(isIsraelCity(CANONICAL_YOKNEAM));

assert.match(wizard, /label="שם פרטי"/);
assert.match(wizard, /label="שם משפחה"/);
assert.doesNotMatch(wizard, /שם מלא|Full Name/);
assert.match(wizard, /coalesceSignupNames/);
assert.match(wizard, /buildParentOnboardingSavePayload/);
assert.match(wizard, /validateParentOnboardingRequiredFields/);
assert.match(wizard, /IsraelCitiesMultiSelect/);
assert.doesNotMatch(wizard, /רחוב \*|מס' בית/);

const validDraft = {
  ...emptyParentOnboardingDraft(),
  firstName: "נועה",
  lastName: "לוי",
  birthDate: "1990-01-15",
  city: "חיפה",
  preferredLanguage: "עברית" as const,
  childrenCount: 1 as const,
  children: childBlocksForCount(1, []).map((child) => ({ ...child, name: "עומר", birthDate: "2019-02-02" })),
  hasPets: false,
  hasChildSpecialOrMedicalInformation: false
};

assert.equal(validateParentOnboardingRequiredFields(validDraft), null);
assert.equal(
  validateParentOnboardingRequiredFields({ ...validDraft, city: "" }),
  "יש לבחור עיר / אזור מגורים."
);
assert.equal(
  validateParentOnboardingRequiredFields({ ...validDraft, birthDate: "" }),
  "יש להזין תאריך לידה."
);

const signupNames = coalesceSignupNames(
  { first_name: "נועה", last_name: "לוי" },
  { first_name: "", last_name: "" }
);
assert.deepEqual(signupNames, { first_name: "נועה", last_name: "לוי" });

const preserved = buildParentOnboardingSavePayload(
  { ...validDraft, firstName: signupNames.first_name, lastName: signupNames.last_name },
  "2026-08-23T12:00:00.000Z"
);
assert.equal(preserved.first_name, "נועה");
assert.equal(preserved.last_name, "לוי");
assert.ok(!("first_name" in parentOnboardingNamePatch({ first_name: "", last_name: "" })));
assert.ok(!("last_name" in parentOnboardingNamePatch({ first_name: "נועה", last_name: "   " })));

const emptyNamePayload = buildParentOnboardingSavePayload(
  { ...validDraft, firstName: "", lastName: "" },
  "2026-08-23T12:00:00.000Z"
);
assert.equal(Object.hasOwn(emptyNamePayload, "first_name"), false);
assert.equal(Object.hasOwn(emptyNamePayload, "last_name"), false);

assert.match(multiSelect, /from "@\/lib\/geo\/israel-cities"/);
assert.match(autocomplete, /from "@\/lib\/geo\/israel-cities"/);
assert.match(searchFilters, /CityAutocomplete/);
assert.match(read("lib/sitter/parent-search-filters.ts"), /selectedCity: IsraelCity/);

const yokneamPayload = buildParentOnboardingSavePayload(
  { ...validDraft, city: CANONICAL_YOKNEAM },
  "2026-08-23T12:00:00.000Z"
);
assert.equal((yokneamPayload.address as { city: string }).city, "יקנעם עילית");
assert.equal(yokneamPayload.city, "יקנעם עילית");

const searchWithYokneam = normalizeParentSearchFilters({ selectedCity: CANONICAL_YOKNEAM });
assert.equal(searchWithYokneam.selectedCity, CANONICAL_YOKNEAM);
const searchUnknownSpelling = normalizeParentSearchFilters({
  selectedCity: "יקנעם" as typeof CANONICAL_YOKNEAM
});
assert.equal(searchUnknownSpelling.selectedCity, "");

console.log("parent-onboarding-ux: ok");
console.log(`canonical Yokneam: ${CANONICAL_YOKNEAM}`);
