import { getParentPreferences, listBusySlotsForParent } from "@/lib/parent/service";
import type { ParentBusySlot, ParentPreferences } from "@/lib/parent/types";
import { getNannyProfiles } from "@/lib/ratings/service";
import type { NannyProfile } from "@/lib/ratings/types";

export const DEFAULT_PARENT_PREFERENCES: ParentPreferences = {
  parentName: "הורה",
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

export type ParentDashboardData = {
  profiles: NannyProfile[];
  preferences: ParentPreferences;
  busySlots: ParentBusySlot[];
};

/** Server-safe loader with fallbacks so dashboard SSR never throws. */
export async function loadParentDashboardData(
  parentName = DEFAULT_PARENT_PREFERENCES.parentName
): Promise<ParentDashboardData> {
  const safeName = parentName.trim() || DEFAULT_PARENT_PREFERENCES.parentName;

  try {
    const [profiles, preferences, busySlots] = await Promise.all([
      getNannyProfiles(),
      getParentPreferences(safeName),
      listBusySlotsForParent(safeName)
    ]);

    return {
      profiles: Array.isArray(profiles) ? profiles : [],
      preferences: preferences ?? { ...DEFAULT_PARENT_PREFERENCES, parentName: safeName },
      busySlots: Array.isArray(busySlots) ? busySlots : []
    };
  } catch (error) {
    console.error("[loadParentDashboardData]", error);
    return {
      profiles: [],
      preferences: { ...DEFAULT_PARENT_PREFERENCES, parentName: safeName },
      busySlots: []
    };
  }
}
