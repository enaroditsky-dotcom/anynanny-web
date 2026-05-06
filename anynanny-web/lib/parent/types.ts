export type ParentPreferences = {
  parentName: string;
  favoriteSitterId: string;
  reassurancePingEnabled: boolean;
  transportMode: "taxi" | "self" | "no_taxi";
  locationLabel: string;
  minRate: number;
  maxRate: number;
  preferredGender: "all" | "male" | "female";
  minAge: number;
  minExperienceYears: number;
  minRating: number;
  calendarSyncGoogle: boolean;
  calendarSyncPhone: boolean;
};

/**
 * Stored calendar data: free/busy intervals only (read-only calendar model).
 * Never persist event titles, descriptions, or locations.
 */
export type ParentBusySlot = {
  id: string;
  parentName: string;
  startsAt: string;
  endsAt: string;
};
