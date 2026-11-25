import { SITTER_AVAILABILITY_TABLE } from "@/lib/availability/constants";

export const SITTER_PROFILE_BOOST_HREF = "/sitter/profile-boost";
export const SITTER_BOOST_CHECKPOINT_COUNT = 8;

export const SITTER_BOOST_CHECKPOINT_LABELS = [
  "העליתי תמונת פרופיל.",
  "מילאתי את הפרטים האישיים שלי.",
  "כתבתי כמה מילים על עצמי.",
  "מילאתי את פרטי הניסיון שלי.",
  "השלמתי את פרטי הכישורים וההעדפות שלי.",
  "עדכנתי ושמרתי את סידור העבודה לשבוע הקרוב.",
  "קיבלתי לפחות דירוג אחד ממשפחה.",
  "קיבלתי לפחות חוות דעת כתובה אחת."
] as const;

export type SitterBoostCheckpointState = "complete" | "incomplete" | "unknown";

export type SitterBoostProfileFields = {
  profileAvatarUrl?: string | null;
  accountAvatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  addressFull?: string | null;
  homeCity?: string | null;
  idNumber?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  yearsExperienceBand?: string | null;
  experienceAgeGroups?: readonly unknown[] | null;
  languages?: readonly unknown[] | null;
  certifications?: string | null;
  preferredAges?: string | null;
  preferredChildAgeGroups?: readonly unknown[] | null;
  taskCapabilities?: readonly unknown[] | null;
  workTypePreferences?: readonly unknown[] | null;
  additionalServiceInterests?: readonly unknown[] | null;
  homeworkHelp?: boolean | null;
  hasCar?: boolean | null;
  hasFirstAidTraining?: boolean | null;
  hasChildcareTraining?: boolean | null;
  hasSpecialNeedsExperience?: boolean | null;
  hasDriversLicense?: boolean | null;
  maxChildren?: number | null;
  desiredHoursPerWeek?: number | null;
};

export type SitterBoostProgressInput = {
  profile: SitterBoostProfileFields | null;
  /** Saved availability dates. Empty means none were found. Null means the read failed. */
  savedAvailabilityDates: readonly string[] | null;
  /** Published ratings addressed to this sitter. Null means the read failed. */
  publishedRatingCount: number | null;
  /** Published ratings that include a non-empty written comment. Null means the read failed. */
  publishedWrittenReviewCount: number | null;
  now?: Date;
};

export type SitterBoostProgress = {
  checkpoints: SitterBoostCheckpointState[];
  completed: number;
  total: number;
  /** 0–100. Unknown checkpoints stay incomplete and are not invented. */
  percent: number;
};

function filledText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function filledList(value: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(value) && value.some((item) => String(item ?? "").trim().length > 0);
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today through the next six days. Past dates are not an upcoming-week schedule. */
export function upcomingScheduleBounds(now = new Date()): { start: string; end: string } {
  const end = new Date(now);
  end.setDate(now.getDate() + 6);
  return { start: isoDate(now), end: isoDate(end) };
}

export function hasSavedUpcomingWeekSchedule(dates: readonly string[], now = new Date()): boolean {
  const { start, end } = upcomingScheduleBounds(now);
  return dates.some((value) => {
    const day = String(value).slice(0, 10);
    return day >= start && day <= end;
  });
}

function personalDetailsComplete(profile: SitterBoostProfileFields): boolean {
  const named = filledText(profile.firstName) && filledText(profile.lastName);
  const extra =
    filledText(profile.birthDate) || filledText(profile.addressFull) || filledText(profile.homeCity) || filledText(profile.idNumber);
  return named && extra;
}

function experienceComplete(profile: SitterBoostProfileFields): boolean {
  if (filledText(profile.yearsExperienceBand)) return true;
  if (typeof profile.yearsExperience === "number" && Number.isFinite(profile.yearsExperience) && profile.yearsExperience > 0) {
    return true;
  }
  return filledList(profile.experienceAgeGroups);
}

function skillsAndPreferencesComplete(profile: SitterBoostProfileFields): boolean {
  return (
    profile.homeworkHelp === true ||
    profile.hasCar === true ||
    profile.hasFirstAidTraining === true ||
    profile.hasChildcareTraining === true ||
    profile.hasSpecialNeedsExperience === true ||
    profile.hasDriversLicense === true ||
    (typeof profile.maxChildren === "number" && profile.maxChildren > 0) ||
    (typeof profile.desiredHoursPerWeek === "number" && profile.desiredHoursPerWeek > 0) ||
    filledList(profile.languages) ||
    filledText(profile.certifications) ||
    filledText(profile.preferredAges) ||
    filledList(profile.preferredChildAgeGroups) ||
    filledList(profile.taskCapabilities) ||
    filledList(profile.workTypePreferences) ||
    filledList(profile.additionalServiceInterests)
  );
}

function photoComplete(profile: SitterBoostProfileFields): boolean {
  return filledText(profile.profileAvatarUrl) || filledText(profile.accountAvatarUrl);
}

export function evaluateSitterBoostProgress(input: SitterBoostProgressInput): SitterBoostProgress {
  const profile = input.profile;
  const now = input.now ?? new Date();
  const checkpoints: SitterBoostCheckpointState[] = [
    profile ? (photoComplete(profile) ? "complete" : "incomplete") : "unknown",
    profile ? (personalDetailsComplete(profile) ? "complete" : "incomplete") : "unknown",
    profile ? (filledText(profile.bio) ? "complete" : "incomplete") : "unknown",
    profile ? (experienceComplete(profile) ? "complete" : "incomplete") : "unknown",
    profile ? (skillsAndPreferencesComplete(profile) ? "complete" : "incomplete") : "unknown",
    input.savedAvailabilityDates == null
      ? "unknown"
      : hasSavedUpcomingWeekSchedule(input.savedAvailabilityDates, now)
        ? "complete"
        : "incomplete",
    input.publishedRatingCount == null ? "unknown" : input.publishedRatingCount > 0 ? "complete" : "incomplete",
    input.publishedWrittenReviewCount == null
      ? "unknown"
      : input.publishedWrittenReviewCount > 0
        ? "complete"
        : "incomplete"
  ];
  const completed = checkpoints.filter((state) => state === "complete").length;
  return {
    checkpoints,
    completed,
    total: SITTER_BOOST_CHECKPOINT_COUNT,
    percent: (completed / SITTER_BOOST_CHECKPOINT_COUNT) * 100
  };
}

export function countPublishedWrittenReviews(
  rows: readonly { comment?: string | null; published_at?: string | null }[]
): number {
  return rows.filter((row) => row.published_at != null && filledText(row.comment)).length;
}

export const SITTER_BOOST_AVAILABILITY_TABLE = SITTER_AVAILABILITY_TABLE;
