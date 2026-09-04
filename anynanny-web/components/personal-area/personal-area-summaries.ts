export const PERSONAL_AREA_EMPTY_SUMMARY = "לא הוגדר";

export function joinPersonalAreaSummary(
  parts: Array<string | null | undefined>,
  empty = PERSONAL_AREA_EMPTY_SUMMARY
): string {
  const cleaned = parts.map((part) => String(part ?? "").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" · ") : empty;
}

export function truncatePersonalAreaSummary(value: string, max = 72): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return PERSONAL_AREA_EMPTY_SUMMARY;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export function parentPersonalDetailsSummary(
  firstName: string,
  lastName: string,
  languageLabel: string
): string {
  return joinPersonalAreaSummary([`${firstName} ${lastName}`.trim(), languageLabel]);
}

export function parentAddressSummary(city: string): string {
  return joinPersonalAreaSummary([city]);
}

export function parentFamilySummary(childrenCount: number, maritalLabel: string): string {
  const childrenPart =
    childrenCount <= 0 ? "" : childrenCount === 1 ? "ילד אחד" : `${childrenCount} ילדים`;
  return joinPersonalAreaSummary([childrenPart, maritalLabel]);
}

export function parentChildrenSummary(names: readonly string[], count: number): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length) return joinPersonalAreaSummary(cleaned);
  if (count <= 0) return PERSONAL_AREA_EMPTY_SUMMARY;
  return count === 1 ? "ילד אחד" : `${count} ילדים`;
}

export function parentHouseholdSummary(
  hasPets: boolean | null | undefined,
  hasMedical: boolean | null | undefined
): string {
  return joinPersonalAreaSummary([
    hasPets === true ? "חיות מחמד" : "",
    hasMedical === true ? "מידע רפואי" : ""
  ]);
}

export function parentPreferencesSummary(filledCount: number): string {
  if (filledCount <= 0) return PERSONAL_AREA_EMPTY_SUMMARY;
  return filledCount === 1 ? "העדפה אחת פעילה" : `${filledCount} העדפות פעילות`;
}

export function parentEventsSummary(count: number): string {
  if (count <= 0) return PERSONAL_AREA_EMPTY_SUMMARY;
  return count === 1 ? "אירוע אחד" : `${count} אירועים`;
}

export function countParentPreferenceGroups(input: {
  typicalNeed: readonly string[];
  frequency: string;
  reasons: readonly string[];
  reminders: readonly string[];
  autoSuggest: boolean | null;
}): number {
  return [
    input.typicalNeed.length > 0,
    Boolean(input.frequency.trim()),
    input.reasons.length > 0,
    input.reminders.length > 0,
    input.autoSuggest !== null
  ].filter(Boolean).length;
}

export function sitterPersonalDetailsSummary(homeCity: string, birthDateDisplay: string): string {
  return joinPersonalAreaSummary([homeCity, birthDateDisplay]);
}

export function sitterExperienceSummary(
  experienceBandLabel: string,
  yearsExperience: string
): string {
  const label = experienceBandLabel.trim() || yearsExperience.trim();
  if (!label) return "";
  if (/^\d/.test(label)) return `${label} שנות ניסיון`;
  return label;
}

export function sitterProfessionalSummary(
  experienceBandLabel: string,
  yearsExperience: string,
  ageGroupsLabel: string
): string {
  return joinPersonalAreaSummary([
    sitterExperienceSummary(experienceBandLabel, yearsExperience),
    ageGroupsLabel
  ]);
}

export function sitterWorkingCitiesSummary(cities: readonly string[]): string {
  return joinPersonalAreaSummary([...cities]);
}

export function sitterCapabilitiesSummary(input: {
  hasLicense: boolean | null | undefined;
  hasCar: boolean | null | undefined;
  hasFirstAid: boolean | null | undefined;
}): string {
  return joinPersonalAreaSummary([
    input.hasLicense === true ? "רישיון" : "",
    input.hasCar === true ? "רכב" : "",
    input.hasFirstAid === true ? "עזרה ראשונה" : ""
  ]);
}

export function sitterWorkPreferencesSummary(
  hoursLabel: string,
  acceptsShortNotice: boolean | null | undefined
): string {
  return joinPersonalAreaSummary([
    hoursLabel,
    acceptsShortNotice === true ? "משמרות קצרות" : ""
  ]);
}

export function sitterBioSummary(bio: string): string {
  return truncatePersonalAreaSummary(bio);
}

export function sitterRefereesSummary(phone1: string, phone2: string): string {
  const count = [phone1, phone2].filter((phone) => phone.trim()).length;
  if (count <= 0) return PERSONAL_AREA_EMPTY_SUMMARY;
  return count === 1 ? "ממליץ אחד" : "2 ממליצים";
}

export function sitterLegalSummary(declared: boolean): string {
  return declared ? "הצהרה אושרה" : PERSONAL_AREA_EMPTY_SUMMARY;
}

export function sitterReceivingSummary(bitConfigured: boolean, payboxConfigured: boolean): string {
  return joinPersonalAreaSummary([
    bitConfigured ? "Bit" : "",
    payboxConfigured ? "PayBox" : ""
  ]);
}

export function sitterBankSummary(hasDetails: boolean): string {
  return hasDetails ? "חשבון שמור" : PERSONAL_AREA_EMPTY_SUMMARY;
}
