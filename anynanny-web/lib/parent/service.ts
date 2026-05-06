import { listAvailability } from "@/lib/calendar/repository";
import { getNannyProfiles } from "@/lib/ratings/service";
import {
  listParentBusySlots,
  listParentPreferences,
  saveParentBusySlots,
  saveParentPreferences
} from "@/lib/parent/repository";
import type { ParentBusySlot, ParentPreferences } from "@/lib/parent/types";

const DEFAULT_PARENT = "הורה";

function defaultPreferences(parentName: string): ParentPreferences {
  return {
    parentName,
    favoriteSitterId: "",
    reassurancePingEnabled: true,
    transportMode: "taxi",
    locationLabel: "תל אביב",
    minRate: 40,
    maxRate: 120,
    preferredGender: "all",
    minAge: 18,
    minExperienceYears: 0,
    minRating: 0,
    calendarSyncGoogle: false,
    calendarSyncPhone: false
  };
}

export async function getParentPreferences(parentName = DEFAULT_PARENT): Promise<ParentPreferences> {
  const name = parentName.trim() || DEFAULT_PARENT;
  const all = await listParentPreferences();
  const existing = all.find((item) => item.parentName === name);
  if (!existing) return defaultPreferences(name);
  return {
    ...defaultPreferences(name),
    ...existing,
    parentName: name,
    favoriteSitterId: String(existing.favoriteSitterId ?? "")
  };
}

export async function upsertParentPreferences(input: ParentPreferences): Promise<ParentPreferences> {
  const all = await listParentPreferences();
  const index = all.findIndex((item) => item.parentName === input.parentName);
  if (index === -1) all.push(input);
  else all[index] = input;
  await saveParentPreferences(all);
  return input;
}

export async function listBusySlotsForParent(parentName = DEFAULT_PARENT): Promise<ParentBusySlot[]> {
  const all = await listParentBusySlots();
  const name = parentName.trim() || DEFAULT_PARENT;
  return all.filter((item) => item.parentName === name).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function upsertBusySlot(input: ParentBusySlot): Promise<ParentBusySlot> {
  const all = await listParentBusySlots();
  const index = all.findIndex((item) => item.id === input.id);
  if (index === -1) all.push(input);
  else all[index] = input;
  await saveParentBusySlots(all);
  return input;
}

/** ISO yyyy-mm-dd */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Server only receives evening dates (no event titles). Resolves sitter availability for those dates.
 */
export async function buildSuggestionsForEveningDates(parentName: string, eveningDates: string[]) {
  const name = parentName.trim() || DEFAULT_PARENT;
  const uniqueDates = [...new Set(eveningDates.map((d) => d.trim()).filter((d) => DATE_ONLY.test(d)))];
  if (uniqueDates.length === 0) return [];

  const [profiles, availability, preferences] = await Promise.all([
    getNannyProfiles(),
    listAvailability(),
    getParentPreferences(name)
  ]);

  return uniqueDates.map((date) => {
    const availableSitterIds = new Set(
      availability.filter((item) => item.date === date && item.availableSlots.length > 0).map((item) => item.sitterId)
    );
    const matchingProfiles = profiles.filter((profile) => availableSitterIds.has(profile.nannyName));
    const favorite =
      preferences.favoriteSitterId.trim() &&
      matchingProfiles.find((profile) => profile.anyNannyId === preferences.favoriteSitterId.trim());
    const preferred = favorite ?? matchingProfiles[0];
    const message = preferred
      ? `הסיטר/ית המועדף/ת שלך ${preferred.nannyName} זמין/ה לערב שלך בתאריך ${date} - להזמין עכשיו?`
      : `יש לך חלון עמוס בערב בתאריך ${date}. רוצים לראות מי מהסיטרים זמין?`;

    return {
      date,
      message,
      suggestedSitters: matchingProfiles.slice(0, 5).map((profile) => profile.nannyName)
    };
  });
}
