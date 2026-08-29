import type { BookingRow, BookingStatus } from "@/lib/bookings/constants";
import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/booking-status-normalize";
import { scheduledEndHasPassed } from "@/lib/bookings/booking-date-utils";
import { isCanonicalDoubleShakeStartCompleted } from "@/lib/bookings/no-start-cancellation";

/** Clarification: scheduled end passed, no recorded start, waiting for both sides. */
export const MISSED_SHIFT_AWAITING_REASON_STATUS = "awaiting_missed_shift_reason" as const;
/** Final: shift did not occur. Distinct from cancelled. */
export const MISSED_SHIFT_DID_NOT_OCCUR_STATUS = "did_not_occur" as const;
/** Reason 8: both sides (or compatible confirmation) say it happened without app start. */
export const MISSED_SHIFT_HAPPENED_UNVERIFIED_STATUS = "happened_unverified" as const;
/** Parent and sitter materially disagree (happened vs did-not-occur). */
export const MISSED_SHIFT_DISPUTED_STATUS = "missed_shift_disputed" as const;

export const MISSED_SHIFT_CLARIFICATION_STATUSES = [
  MISSED_SHIFT_AWAITING_REASON_STATUS
] as const;

export const MISSED_SHIFT_RESOLVED_STATUSES = [
  MISSED_SHIFT_DID_NOT_OCCUR_STATUS,
  MISSED_SHIFT_HAPPENED_UNVERIFIED_STATUS,
  MISSED_SHIFT_DISPUTED_STATUS
] as const;

export const MISSED_SHIFT_LIFECYCLE_STATUSES = [
  ...MISSED_SHIFT_CLARIFICATION_STATUSES,
  ...MISSED_SHIFT_RESOLVED_STATUSES
] as const;

export type MissedShiftLifecycleStatus = (typeof MISSED_SHIFT_LIFECYCLE_STATUSES)[number];

export const MISSED_SHIFT_REASON_CODES = [
  "nanny_no_show",
  "parent_unavailable",
  "mutual_off_app_agreement",
  "date_or_time_error",
  "forgot_shift",
  "technical_start_failure",
  "emergency_or_unexpected_change",
  "shift_happened_without_app_start"
] as const;

export type MissedShiftReasonCode = (typeof MISSED_SHIFT_REASON_CODES)[number];

export const DID_NOT_OCCUR_REASON_CODES: readonly MissedShiftReasonCode[] = [
  "nanny_no_show",
  "parent_unavailable",
  "mutual_off_app_agreement",
  "date_or_time_error",
  "forgot_shift",
  "technical_start_failure",
  "emergency_or_unexpected_change"
];

export const HAPPENED_WITHOUT_APP_REASON: MissedShiftReasonCode =
  "shift_happened_without_app_start";

export const MISSED_SHIFT_REASON_LABELS: Record<MissedShiftReasonCode, string> = {
  nanny_no_show: "הנני לא הגיעה.",
  parent_unavailable: "ההורה לא היה זמין / לא אישר התחלה.",
  mutual_off_app_agreement: "שני הצדדים סיכמו בעל־פה שלא לקיים, אבל לא ביטלו באפליקציה.",
  date_or_time_error: "הייתה טעות בתאריך או בשעה.",
  forgot_shift: "אחד הצדדים שכח מהמשמרת.",
  technical_start_failure: "הייתה בעיה טכנית שמנעה התחלה / Double-Shake.",
  emergency_or_unexpected_change: "מצב חירום או שינוי בלתי צפוי ברגע האחרון.",
  shift_happened_without_app_start: "המשמרת התקיימה בפועל, אבל אף אחד לא הפעיל אותה באפליקציה."
};

export const MISSED_SHIFT_COPY = {
  title: "המשמרת לא התקיימה",
  bodyTemplate:
    "המערכת זיהתה כי המשמרת שנקבעה לתאריך {DATE}, בין השעות {START_TIME}–{END_TIME}, לא התקיימה ולא נרשמה בה התחלה.",
  choosePrompt: "יש לבחור את הסיבה לכך שהמשמרת לא התקיימה.",
  footer: "הדיווח נשמר במערכת ומשמש לקביעת סטטוס המשמרת.",
  waitingOtherSide: "ממתינה לעדכון",
  didNotOccur: "לא התקיימה",
  happenedUnverified: "התקיימה ללא הפעלה — ממתינה לאימות",
  disputed: "דורשת בירור",
  submit: "שליחת דיווח",
  submitting: "שולחים…",
  alreadySubmitted: "הדיווח שלך נשמר. ממתינים לצד השני.",
  selectReason: "בחרו סיבה"
} as const;

export const RECONCILE_UNSTARTED_PAST_BOOKINGS_RPC = "reconcile_unstarted_past_bookings" as const;
export const SUBMIT_MISSED_SHIFT_REASON_RPC = "submit_missed_shift_reason" as const;
export const MISSED_SHIFT_CLARIFICATION_KIND = "missed_shift_clarification" as const;

export const MISSED_SHIFT_REPORTS_TABLE = "booking_missed_shift_reports" as const;

export type MissedShiftReportRow = {
  booking_id: string;
  role: "parent" | "sitter";
  reason_code: MissedShiftReasonCode;
  submitted_by: string;
  submitted_at: string;
};

export type MissedShiftOutcome =
  | "awaiting_other_side"
  | "did_not_occur"
  | "happened_unverified"
  | "disputed";

export type MissedShiftDetectionInput = {
  status?: unknown;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  cancelled_at?: string | null;
  requires_admin_review?: boolean | null;
  sitter_start_shake?: string | null;
  parent_start_shake?: string | null;
};

function asStatusInput(status: unknown): BookingStatusInput {
  if (status == null) return status;
  if (typeof status === "object") return status as BookingStatusInput;
  return String(status) as BookingStatus;
}

function normStatus(status: unknown): string {
  return normalizeBookingStatus(asStatusInput(status)) ?? String(status ?? "").trim().toLowerCase();
}

export function isMissedShiftReasonCode(value: unknown): value is MissedShiftReasonCode {
  return (
    typeof value === "string" &&
    (MISSED_SHIFT_REASON_CODES as readonly string[]).includes(value)
  );
}

export function isDidNotOccurReason(code: MissedShiftReasonCode): boolean {
  return (DID_NOT_OCCUR_REASON_CODES as readonly string[]).includes(code);
}

export function isHappenedWithoutAppReason(code: MissedShiftReasonCode): boolean {
  return code === HAPPENED_WITHOUT_APP_REASON;
}

export function isMissedShiftLifecycleStatus(status: unknown): boolean {
  const normalized = normStatus(status);
  return (MISSED_SHIFT_LIFECYCLE_STATUSES as readonly string[]).includes(normalized);
}

export function isMissedShiftClarificationStatus(status: unknown): boolean {
  return normStatus(status) === MISSED_SHIFT_AWAITING_REASON_STATUS;
}

export function isMissedShiftDidNotOccurStatus(status: unknown): boolean {
  return normStatus(status) === MISSED_SHIFT_DID_NOT_OCCUR_STATUS;
}

export function isMissedShiftHappenedUnverifiedStatus(status: unknown): boolean {
  return normStatus(status) === MISSED_SHIFT_HAPPENED_UNVERIFIED_STATUS;
}

export function isMissedShiftDisputedStatus(status: unknown): boolean {
  return normStatus(status) === MISSED_SHIFT_DISPUTED_STATUS;
}

export function isMissedShiftTerminalStatus(status: unknown): boolean {
  const normalized = normStatus(status);
  return (MISSED_SHIFT_RESOLVED_STATUSES as readonly string[]).includes(normalized);
}

/** These statuses are never payable and never enter Hyp / settlement. */
export function isBookingBlockedFromPaymentByMissedShift(status: unknown): boolean {
  return isMissedShiftLifecycleStatus(status);
}

/** Mandatory post-completion rating must never run for these statuses. */
export function isBookingBlockedFromMandatoryRating(status: unknown): boolean {
  return isMissedShiftLifecycleStatus(status);
}

export function bookingHasRecordedStart(input: {
  actual_start_time?: string | null;
  status?: unknown;
  sitter_start_shake?: string | null;
  parent_start_shake?: string | null;
}): boolean {
  if (String(input.actual_start_time ?? "").trim()) return true;
  if (
    isCanonicalDoubleShakeStartCompleted({
      sitterStartShake: input.sitter_start_shake,
      parentStartShake: input.parent_start_shake
    })
  ) {
    return true;
  }
  const status = normStatus(input.status);
  return (
    status === "parent_started" ||
    status === "sitter_ended" ||
    status === "completed"
  );
}

export { scheduledEndHasPassed };

/**
 * Source-of-truth detector: approved, scheduled end fully past, never started,
 * no Double-Shake start, not cancelled / completed / review-held.
 */
export function shouldEnterMissedShiftClarification(
  input: MissedShiftDetectionInput,
  nowMs = Date.now()
): boolean {
  const status = normStatus(input.status);
  if (status !== "approved") return false;
  if (String(input.cancelled_at ?? "").trim()) return false;
  if (input.requires_admin_review === true) return false;
  if (bookingHasRecordedStart(input)) return false;
  if (
    !scheduledEndHasPassed(
      {
        booking_date: String(input.booking_date ?? ""),
        start_time: String(input.start_time ?? ""),
        end_time: String(input.end_time ?? "")
      },
      nowMs
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Compatible 1–7 vs 1–7 → did_not_occur.
 * Both reason 8 → happened_unverified.
 * One side 8 and the other 1–7 → disputed.
 * Missing a side → wait.
 */
export function resolveMissedShiftOutcome(
  parentReason: MissedShiftReasonCode | null | undefined,
  sitterReason: MissedShiftReasonCode | null | undefined
): MissedShiftOutcome {
  if (!parentReason || !sitterReason) return "awaiting_other_side";

  const parentHappened = isHappenedWithoutAppReason(parentReason);
  const sitterHappened = isHappenedWithoutAppReason(sitterReason);

  if (parentHappened && sitterHappened) return "happened_unverified";
  if (parentHappened !== sitterHappened) return "disputed";
  return "did_not_occur";
}

export function missedShiftOutcomeToStatus(outcome: MissedShiftOutcome): MissedShiftLifecycleStatus {
  switch (outcome) {
    case "did_not_occur":
      return MISSED_SHIFT_DID_NOT_OCCUR_STATUS;
    case "happened_unverified":
      return MISSED_SHIFT_HAPPENED_UNVERIFIED_STATUS;
    case "disputed":
      return MISSED_SHIFT_DISPUTED_STATUS;
    default:
      return MISSED_SHIFT_AWAITING_REASON_STATUS;
  }
}

export function missedShiftStatusLabel(status: unknown): string | null {
  const normalized = normStatus(status);
  if (normalized === MISSED_SHIFT_AWAITING_REASON_STATUS) return MISSED_SHIFT_COPY.waitingOtherSide;
  if (normalized === MISSED_SHIFT_DID_NOT_OCCUR_STATUS) return MISSED_SHIFT_COPY.didNotOccur;
  if (normalized === MISSED_SHIFT_HAPPENED_UNVERIFIED_STATUS) {
    return MISSED_SHIFT_COPY.happenedUnverified;
  }
  if (normalized === MISSED_SHIFT_DISPUTED_STATUS) return MISSED_SHIFT_COPY.disputed;
  return null;
}

export function formatMissedShiftClockPart(value: string | null | undefined): string {
  if (!value) return "--:--";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) {
    const raw = String(value).trim();
    const timeOnly = raw.match(/(\d{1,2}:\d{2})/);
    return timeOnly ? timeOnly[1] : raw;
  }
  return new Date(ms).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function formatMissedShiftDatePart(bookingDate: string | null | undefined, startTime?: string | null): string {
  const fromStart = startTime ? new Date(startTime).getTime() : NaN;
  if (Number.isFinite(fromStart)) {
    return new Date(fromStart).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }
  const day = String(bookingDate ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-");
    return `${d}.${m}.${y}`;
  }
  return day || "—";
}

export function formatMissedShiftClarificationBody(
  booking: Pick<BookingRow, "booking_date" | "start_time" | "end_time">
): string {
  const date = formatMissedShiftDatePart(booking.booking_date, booking.start_time);
  const start = formatMissedShiftClockPart(booking.start_time);
  const end = formatMissedShiftClockPart(booking.end_time);
  return MISSED_SHIFT_COPY.bodyTemplate
    .replace("{DATE}", date)
    .replace("{START_TIME}", start)
    .replace("{END_TIME}", end);
}

export function reasonLabelForCode(code: MissedShiftReasonCode | null | undefined): string | null {
  if (!code || !isMissedShiftReasonCode(code)) return null;
  return MISSED_SHIFT_REASON_LABELS[code];
}

export function asMissedShiftLifecycleBookingStatus(status: string): BookingStatus | undefined {
  if ((MISSED_SHIFT_LIFECYCLE_STATUSES as readonly string[]).includes(status)) {
    return status as BookingStatus;
  }
  return undefined;
}
