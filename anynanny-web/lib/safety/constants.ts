export const USER_REPORTS_TABLE = "user_reports" as const;
export const USER_BLOCKS_TABLE = "user_blocks" as const;

export const REPORT_CONFIRMATION_MESSAGE = "הדיווח נשלח";

export const BLOCKED_PAIR_MESSAGE = "לא ניתן לבצע פעולה זו מול משתמש זה.";
export const ACCOUNT_SUSPENDED_MESSAGE = "החשבון מושעה ואינו יכול לבצע פעולה זו.";
export const SELF_REPORT_MESSAGE = "לא ניתן לדווח על עצמך.";
export const DUPLICATE_OPEN_REPORT_MESSAGE = "כבר שלחת דיווח על משתמש זה.";

export const REPORT_TARGET_TYPES = ["user", "profile", "message", "review", "photo"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  { id: "abuse", label: "התעללות / הטרדה" },
  { id: "threats", label: "איומים" },
  { id: "illegal", label: "פעילות בלתי חוקית" },
  { id: "spam_fraud", label: "ספאם / הונאה" },
  { id: "inappropriate", label: "תוכן לא הולם" },
  { id: "other", label: "אחר" }
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export const REPORT_STATUSES = ["open", "resolved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_DETAILS_MAX_LENGTH = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafetyUuid(value: string | null | undefined): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

export function isReportReason(value: string | null | undefined): value is ReportReason {
  return REPORT_REASONS.some((reason) => reason.id === value);
}

export function isReportTargetType(value: string | null | undefined): value is ReportTargetType {
  return REPORT_TARGET_TYPES.includes(value as ReportTargetType);
}
