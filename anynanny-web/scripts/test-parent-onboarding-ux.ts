import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { coalesceSignupNames } from "../lib/auth/signup-names";
import { ISRAEL_CITIES, isIsraelCity } from "../lib/geo/israel-cities";
import {
  buildParentOnboardingSavePayload,
  parentOnboardingNamePatch,
  PARENT_ONBOARDING_ADDRESS_ERROR,
  validateParentOnboardingRequiredFields
} from "../lib/parent/parent-onboarding";
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
assert.equal(ISRAEL_CITIES.includes("יקנעם" as (typeof ISRAEL_CITIES)[number]), false);
assert.equal(ISRAEL_CITIES.includes("יוקנעם" as (typeof ISRAEL_CITIES)[number]), false);

// --- Issue 1: parent onboarding no longer asks for first/last name ---
assert.doesNotMatch(wizard, /שם פרטי \*/);
assert.doesNotMatch(wizard, /שם משפחה \*/);
assert.doesNotMatch(wizard, /יש למלא את שם ההורה/);
assert.doesNotMatch(wizard, /onChange=\{\(e\) => setFirstName/);
assert.doesNotMatch(wizard, /onChange=\{\(e\) => setLastName/);
assert.doesNotMatch(wizard, /label className="[^"]*">שם פרטי \*</);
assert.match(wizard, /coalesceSignupNames/);
assert.match(wizard, /readSignupNamesFromDevice/);
assert.match(wizard, /השם נשמר מההרשמה ואין צורך להקליד שוב/);
assert.match(wizard, /buildParentOnboardingSavePayload/);
assert.match(wizard, /validateParentOnboardingRequiredFields/);
assert.match(wizard, /שם פרטי בן\/בת הזוג/);
assert.match(wizard, /שם משפחה בן\/בת הזוג/);

const validAddress = {
  city: "חיפה",
  street: "הרצל",
  houseNumber: "12",
  birthDate: "1990-01-15"
};

assert.equal(validateParentOnboardingRequiredFields(validAddress), null);
assert.equal(
  validateParentOnboardingRequiredFields({ ...validAddress, city: "" }),
  PARENT_ONBOARDING_ADDRESS_ERROR
);
assert.equal(
  validateParentOnboardingRequiredFields({ ...validAddress, street: "  " }),
  PARENT_ONBOARDING_ADDRESS_ERROR
);
assert.equal(
  validateParentOnboardingRequiredFields({ ...validAddress, birthDate: "" }),
  "יש להזין תאריך לידה."
);

const signupNames = coalesceSignupNames(
  { first_name: "נועה", last_name: "לוי" },
  { first_name: "", last_name: "" }
);
assert.deepEqual(signupNames, { first_name: "נועה", last_name: "לוי" });

const preserved = buildParentOnboardingSavePayload({
  firstName: signupNames.first_name,
  lastName: signupNames.last_name,
  birthDate: "1990-01-15",
  city: "חיפה",
  street: "הרצל",
  houseNumber: "12",
  hasSpouse: false,
  spouseFirstName: "",
  spouseLastName: "",
  spouseBirthDate: "",
  weddingDate: "",
  children: [],
  specialEvents: [],
  completedAt: "2026-08-23T12:00:00.000Z"
});
assert.equal(preserved.first_name, "נועה");
assert.equal(preserved.last_name, "לוי");
assert.ok(!("first_name" in parentOnboardingNamePatch({ first_name: "", last_name: "" })));
assert.ok(!("last_name" in parentOnboardingNamePatch({ first_name: "נועה", last_name: "   " })));
assert.ok(!("first_name" in parentOnboardingNamePatch({ first_name: null as unknown as string, last_name: "לוי" })));

const emptyNamePayload = buildParentOnboardingSavePayload({
  firstName: "",
  lastName: "",
  birthDate: "1990-01-15",
  city: "חיפה",
  street: "הרצל",
  houseNumber: "12",
  hasSpouse: false,
  spouseFirstName: "",
  spouseLastName: "",
  spouseBirthDate: "",
  weddingDate: "",
  children: [],
  specialEvents: [],
  completedAt: "2026-08-23T12:00:00.000Z"
});
assert.equal(Object.hasOwn(emptyNamePayload, "first_name"), false);
assert.equal(Object.hasOwn(emptyNamePayload, "last_name"), false);
assert.notEqual(emptyNamePayload.first_name, "");
assert.notEqual(emptyNamePayload.first_name, null);
assert.notEqual(emptyNamePayload.last_name, "");
assert.notEqual(emptyNamePayload.last_name, null);

// --- Issue 2: Yokneam uses the same canonical city as parent search ---
assert.match(wizard, /IsraelCitiesMultiSelect/);
assert.match(multiSelect, /from "@\/lib\/geo\/israel-cities"/);
assert.match(multiSelect, /ISRAEL_CITIES/);
assert.match(autocomplete, /from "@\/lib\/geo\/israel-cities"/);
assert.match(autocomplete, /ISRAEL_CITIES/);
assert.match(searchFilters, /CityAutocomplete/);
assert.match(read("lib/sitter/parent-search-filters.ts"), /selectedCity: IsraelCity/);

assert.ok(ISRAEL_CITIES.includes(CANONICAL_YOKNEAM));
assert.ok(ISRAEL_CITIES.includes("חיפה"));
assert.ok(ISRAEL_CITIES.includes("תל אביב-יפו"));
assert.ok(ISRAEL_CITIES.includes("ירושלים"));

const yokneamPayload = buildParentOnboardingSavePayload({
  firstName: "דנה",
  lastName: "כהן",
  birthDate: "1988-05-02",
  city: CANONICAL_YOKNEAM,
  street: "העצמאות",
  houseNumber: "8",
  hasSpouse: false,
  spouseFirstName: "",
  spouseLastName: "",
  spouseBirthDate: "",
  weddingDate: "",
  children: [],
  specialEvents: [],
  completedAt: "2026-08-23T12:00:00.000Z"
});
const yokneamAddress = yokneamPayload.address as { city: string; street: string; houseNumber: string };
assert.equal(yokneamAddress.city, CANONICAL_YOKNEAM);
assert.equal(yokneamAddress.city, "יקנעם עילית");
assert.equal(yokneamAddress.street, "העצמאות");
assert.equal(yokneamAddress.houseNumber, "8");
assert.equal(validateParentOnboardingRequiredFields({
  city: CANONICAL_YOKNEAM,
  street: "העצמאות",
  houseNumber: "8",
  birthDate: "1988-05-02"
}), null);

const haifaPayload = buildParentOnboardingSavePayload({
  firstName: "דנה",
  lastName: "כהן",
  birthDate: "1988-05-02",
  city: "חיפה",
  street: "הרצל",
  houseNumber: "1",
  hasSpouse: false,
  spouseFirstName: "",
  spouseLastName: "",
  spouseBirthDate: "",
  weddingDate: "",
  children: [],
  specialEvents: [],
  completedAt: "2026-08-23T12:00:00.000Z"
});
assert.equal((haifaPayload.address as { city: string }).city, "חיפה");

const searchWithYokneam = normalizeParentSearchFilters({ selectedCity: CANONICAL_YOKNEAM });
assert.equal(searchWithYokneam.selectedCity, CANONICAL_YOKNEAM);

const searchWithHaifa = normalizeParentSearchFilters({ selectedCity: "חיפה" });
assert.equal(searchWithHaifa.selectedCity, "חיפה");

const searchUnknownSpelling = normalizeParentSearchFilters({
  selectedCity: "יקנעם" as typeof CANONICAL_YOKNEAM
});
assert.equal(searchUnknownSpelling.selectedCity, "");

console.log("parent-onboarding-ux: ok");
console.log(`canonical Yokneam: ${CANONICAL_YOKNEAM}`);
