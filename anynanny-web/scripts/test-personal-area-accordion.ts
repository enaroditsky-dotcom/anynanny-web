import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERSONAL_AREA_EMPTY_SUMMARY,
  countParentPreferenceGroups,
  joinPersonalAreaSummary,
  parentAddressSummary,
  parentChildrenSummary,
  parentEventsSummary,
  parentFamilySummary,
  parentHouseholdSummary,
  parentPersonalDetailsSummary,
  parentPreferencesSummary,
  sitterBankSummary,
  sitterBioSummary,
  sitterCapabilitiesSummary,
  sitterExperienceSummary,
  sitterLegalSummary,
  sitterPersonalDetailsSummary,
  sitterProfessionalSummary,
  sitterReceivingSummary,
  sitterRefereesSummary,
  sitterWorkPreferencesSummary,
  sitterWorkingCitiesSummary
} from "../components/personal-area/personal-area-summaries";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const ui = read("components/personal-area/personal-area-ui.tsx");
const parentPersonal = read("components/parent/parent-personal-area.tsx");
const sitterPersonal = read("components/sitter/sitter-personal-area.tsx");
const identity = read("components/identity/identity-personal-section.tsx");
const receiving = read("components/sitter/SitterManualReceivingDestinationsSection.tsx");
const bank = read("components/sitter/SitterBankDetailsSection.tsx");

assert.match(ui, /data-personal-area-accordion/);
assert.match(ui, /aria-expanded=\{open\}/);
assert.match(ui, /aria-controls=\{panelId\}/);
assert.match(ui, /type="button"/);
assert.match(ui, /ChevronDown/);
assert.match(ui, /const \[open, setOpen\] = useState\(defaultOpen\)/);
assert.match(ui, /defaultOpen = false/);
assert.doesNotMatch(ui, /localStorage|sessionStorage|supabase.*accordion|accordion.*from\(/);
assert.doesNotMatch(ui, /setOpen\(false\).*setOpen\(true\)|exclusive|onlyOne/);

assert.match(parentPersonal, /title="פרטים אישיים"[\s\S]*?defaultOpen/);
assert.match(sitterPersonal, /title="פרטים אישיים"[\s\S]*?defaultOpen/);
assert.equal((parentPersonal.match(/defaultOpen/g) ?? []).length, 1);
assert.equal((sitterPersonal.match(/defaultOpen/g) ?? []).length, 1);

for (const title of [
  "כתובת מגורים",
  "משפחה וילדים",
  "ילדים",
  "מידע חשוב למשמרת",
  "העדפות ותזכורות",
  "אירועים מיוחדים לפינוק"
]) {
  assert.match(parentPersonal, new RegExp(`title="${title}"`));
}

for (const title of [
  "רקע מקצועי",
  "אזור עבודה מועדף",
  "יכולות והתאמה",
  "העדפות עבודה",
  "אודותיי",
  "הגדרות תצוגה",
  "אנשי קשר ממליצים",
  "הצהרה"
]) {
  assert.match(sitterPersonal, new RegExp(`title="${title}"`));
}

assert.match(identity, /title="אימות זהות"/);
assert.match(identity, /summary=/);
assert.match(receiving, /title="קבלה ב-Bit וב-PayBox"/);
assert.match(receiving, /sitterReceivingSummary/);
assert.match(bank, /title="פרטי בנק"/);
assert.match(bank, /sitterBankSummary/);
assert.match(parentPersonal, /IdentityPersonalSection/);
assert.match(sitterPersonal, /IdentityPersonalSection/);
assert.doesNotMatch(sitterPersonal, /זמינות כללית|generic availability|availability_notes/);

assert.equal(joinPersonalAreaSummary(["", "  "]), PERSONAL_AREA_EMPTY_SUMMARY);
assert.equal(parentPersonalDetailsSummary("אדי", "נרודיצקי", "עברית"), "אדי נרודיצקי · עברית");
assert.equal(parentAddressSummary("חיפה"), "חיפה");
assert.equal(parentAddressSummary(""), PERSONAL_AREA_EMPTY_SUMMARY);
assert.equal(parentFamilySummary(2, "נשוי/אה"), "2 ילדים · נשוי/אה");
assert.equal(parentChildrenSummary(["עומר", "מאיה"], 2), "עומר · מאיה");
assert.equal(parentHouseholdSummary(true, true), "חיות מחמד · מידע רפואי");
assert.equal(parentHouseholdSummary(null, null), PERSONAL_AREA_EMPTY_SUMMARY);
assert.equal(parentPreferencesSummary(2), "2 העדפות פעילות");
assert.equal(
  countParentPreferenceGroups({
    typicalNeed: ["evening"],
    frequency: "",
    reasons: ["work"],
    reminders: [],
    autoSuggest: null
  }),
  2
);
assert.equal(parentEventsSummary(0), PERSONAL_AREA_EMPTY_SUMMARY);

assert.equal(sitterPersonalDetailsSummary("חיפה", "03/08/2000"), "חיפה · 03/08/2000");
assert.equal(sitterExperienceSummary("3", ""), "3 שנות ניסיון");
assert.equal(
  sitterProfessionalSummary("3", "", "תינוקות · פעוטות"),
  "3 שנות ניסיון · תינוקות · פעוטות"
);
assert.equal(sitterWorkingCitiesSummary(["חיפה", "נשר", "קריות"]), "חיפה · נשר · קריות");
assert.equal(
  sitterCapabilitiesSummary({ hasLicense: true, hasCar: true, hasFirstAid: true }),
  "רישיון · רכב · עזרה ראשונה"
);
assert.equal(sitterWorkPreferencesSummary("20 שעות בשבוע", true), "20 שעות בשבוע · משמרות קצרות");
assert.equal(sitterBioSummary(""), PERSONAL_AREA_EMPTY_SUMMARY);
assert.equal(sitterRefereesSummary("0501234567", ""), "ממליץ אחד");
assert.equal(sitterLegalSummary(false), PERSONAL_AREA_EMPTY_SUMMARY);
assert.equal(sitterReceivingSummary(true, true), "Bit · PayBox");
assert.equal(sitterBankSummary(false), PERSONAL_AREA_EMPTY_SUMMARY);

assert.match(parentPersonal, /persist\(/);
assert.match(sitterPersonal, /editKey === "working_cities"/);
assert.doesNotMatch(parentPersonal, /from\(".*accordion/);
assert.doesNotMatch(sitterPersonal, /from\(".*accordion/);

console.log("test-personal-area-accordion: PASS");
