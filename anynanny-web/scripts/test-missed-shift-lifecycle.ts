import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isBookingDueForParentActiveShiftUi,
  isFutureScheduledBooking
} from "../lib/bookings/booking-shift-ui";
import { isBookingLiveAcrossMidnight } from "../lib/bookings/booking-date-utils";
import { shouldAutoCancelApprovedBookingWithoutStart } from "../lib/bookings/no-start-cancellation";
import { PAYABLE_BOOKING_STATUSES } from "../lib/billing/compute-shift-charge";
import { isCanonicalNotificationKind, notificationHrefForKind } from "../lib/notifications/kinds";
import { privacySafeBodyForKind } from "../lib/push/payload";
import type { BookingStatus } from "../lib/bookings/constants";
import {
  bookingHasRecordedStart,
  formatMissedShiftClarificationBody,
  isBookingBlockedFromMandatoryRating,
  isBookingBlockedFromPaymentByMissedShift,
  isMissedShiftReasonCode,
  MISSED_SHIFT_AWAITING_REASON_STATUS,
  MISSED_SHIFT_COPY,
  MISSED_SHIFT_DID_NOT_OCCUR_STATUS,
  MISSED_SHIFT_DISPUTED_STATUS,
  MISSED_SHIFT_HAPPENED_UNVERIFIED_STATUS,
  MISSED_SHIFT_REASON_CODES,
  MISSED_SHIFT_REASON_LABELS,
  missedShiftOutcomeToStatus,
  missedShiftRequiresViewerAction,
  missedShiftStatusLabel,
  RECONCILE_UNSTARTED_PAST_BOOKINGS_RPC,
  resolveMissedShiftOutcome,
  shouldEnterMissedShiftClarification,
  SUBMIT_MISSED_SHIFT_REASON_RPC
} from "../lib/bookings/missed-shift-lifecycle";
import { mapSubmitMissedShiftError as mapClientError, pickActionableMissedShiftBooking } from "../lib/bookings/missed-shift-client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const NOW = Date.parse("2026-08-30T15:00:00.000Z");
const TODAY = "2026-08-30";

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    parent_id: "p1",
    sitter_id: "s1",
    booking_date: TODAY,
    start_time: "2026-08-30T10:00:00.000Z",
    end_time: "2026-08-30T13:00:00.000Z",
    actual_start_time: null,
    cancelled_at: null,
    created_at: "2026-08-29T10:00:00.000Z",
    updated_at: "2026-08-29T10:00:00.000Z",
    ...overrides,
    status: ((overrides.status as BookingStatus | undefined) ?? "approved") as BookingStatus
  };
}

// A. Future approved shift — unchanged
const future = booking({
  booking_date: "2026-09-02",
  start_time: "2026-09-02T10:00:00.000Z",
  end_time: "2026-09-02T13:00:00.000Z"
});
assert.equal(shouldEnterMissedShiftClarification(future, NOW), false);
assert.equal(isBookingDueForParentActiveShiftUi(future, NOW), false);
assert.equal(isFutureScheduledBooking(future, NOW), true);

// B. Approved currently within window — unchanged
const inWindow = booking({
  start_time: "2026-08-30T14:00:00.000Z",
  end_time: "2026-08-30T17:00:00.000Z"
});
assert.equal(shouldEnterMissedShiftClarification(inWindow, NOW), false);
assert.equal(isBookingDueForParentActiveShiftUi(inWindow, NOW), true);

// C. Approved past scheduled end, never started — enters clarification
const pastUnstarted = booking();
assert.equal(shouldEnterMissedShiftClarification(pastUnstarted, NOW), true);
assert.equal(isBookingDueForParentActiveShiftUi(pastUnstarted, NOW), false);
assert.equal(isBookingLiveAcrossMidnight(pastUnstarted, NOW), false);
assert.equal(isFutureScheduledBooking(pastUnstarted, NOW), false);

// D. Past shift with valid recorded start — not missed
const pastStarted = booking({
  status: "parent_started",
  actual_start_time: "2026-08-30T10:05:00.000Z"
});
assert.equal(shouldEnterMissedShiftClarification(pastStarted, NOW), false);
assert.equal(bookingHasRecordedStart(pastStarted), true);
assert.equal(
  shouldEnterMissedShiftClarification(
    booking({
      sitter_start_shake: "2026-08-30T10:01:00.000Z",
      parent_start_shake: "2026-08-30T10:02:00.000Z"
    }),
    NOW
  ),
  false
);

// E. Cancelled — unchanged
assert.equal(
  shouldEnterMissedShiftClarification(booking({ status: "cancelled", cancelled_at: "2026-08-30T09:00:00.000Z" }), NOW),
  false
);

// F. Completed — unchanged
assert.equal(shouldEnterMissedShiftClarification(booking({ status: "completed" }), NOW), false);

// G / H. Parent + sitter dashboards no longer treat past approved as arrival wait
const parentDash = read("components/parent/parent-dashboard-client.tsx");
assert.match(parentDash, /isMissedShiftLifecycleStatus/);
assert.match(parentDash, /MissedShiftClarificationCard/);
assert.match(parentDash, /reconcileUnstartedPastBookings/);
assert.match(parentDash, /ממתינים להגעת הבייביסיטר/);
assert.match(parentDash, /showMissedShiftClarification/);

const sitterDash = read("app/sitter/dashboard/page.tsx");
assert.match(sitterDash, /MissedShiftClarificationCard/);
assert.match(sitterDash, /showMissedShiftClarification/);
assert.match(sitterDash, /fetchMissedShiftLifecycleBookings/);
assert.doesNotMatch(
  sitterDash.slice(sitterDash.indexOf("showMissedShiftClarification")),
  /showMissedShiftClarification[\s\S]{0,80}sitterHasLiveBooking =[\s\S]{0,40}true/
);
assert.match(parentDash, /missedShiftRequiresViewerAction/);
assert.match(parentDash, /setMissedShiftBooking\(null\)/);
assert.match(sitterDash, /setMissedShiftBooking\(null\)/);
assert.match(sitterDash, /pickActionableMissedShiftBooking\(missedRows, "sitter"/);
assert.match(read("app/parent/dashboard/page.tsx"), /pickActionableMissedShiftBooking\(missedRows, "parent"\)/);

const awaitingUnanswered = {
  id: "m1",
  status: "awaiting_missed_shift_reason" as const,
  parent_reason: null,
  sitter_reason: null
};
const awaitingParentDone = {
  ...awaitingUnanswered,
  parent_reason: "forgot_shift" as const
};
const resolvedMissed = {
  id: "m2",
  status: "did_not_occur" as const,
  parent_reason: "forgot_shift" as const,
  sitter_reason: "nanny_no_show" as const
};
assert.equal(missedShiftRequiresViewerAction(awaitingUnanswered, "parent"), true);
assert.equal(missedShiftRequiresViewerAction(awaitingUnanswered, "sitter"), true);
assert.equal(missedShiftRequiresViewerAction(awaitingParentDone, "parent"), false);
assert.equal(missedShiftRequiresViewerAction(awaitingParentDone, "sitter"), true);
assert.equal(missedShiftRequiresViewerAction(resolvedMissed, "parent"), false);
assert.equal(missedShiftRequiresViewerAction(resolvedMissed, "sitter"), false);
assert.equal(
  pickActionableMissedShiftBooking(
    [resolvedMissed, awaitingParentDone] as never,
    "parent"
  ),
  null
);
assert.equal(
  pickActionableMissedShiftBooking([awaitingParentDone] as never, "sitter")?.id,
  "m1"
);
assert.equal(
  pickActionableMissedShiftBooking([awaitingUnanswered] as never, "parent", new Set(["m1"])),
  null
);

// I / J. Independent parent/sitter responses
const sql = read("supabase/migrations/20260830120000_missed_shift_clarification.sql");
assert.match(sql, /unique \(booking_id, role\)/);
assert.match(sql, /submit_missed_shift_reason/);
assert.match(sql, /v_role := 'parent'/);
assert.match(sql, /v_role := 'sitter'/);
assert.match(sql, /raise exception 'not authorized for booking'/);
assert.match(sql, /raise exception 'already submitted'/);
assert.doesNotMatch(sql, /grant insert on public.booking_missed_shift_reports to authenticated/);

// K. Compatible 1–7 → did_not_occur
assert.equal(resolveMissedShiftOutcome("nanny_no_show", "forgot_shift"), "did_not_occur");
assert.equal(resolveMissedShiftOutcome("parent_unavailable", "technical_start_failure"), "did_not_occur");
assert.equal(
  missedShiftOutcomeToStatus("did_not_occur"),
  MISSED_SHIFT_DID_NOT_OCCUR_STATUS
);

// L. Both reason 8 → happened_unverified
assert.equal(
  resolveMissedShiftOutcome("shift_happened_without_app_start", "shift_happened_without_app_start"),
  "happened_unverified"
);
assert.equal(
  missedShiftOutcomeToStatus("happened_unverified"),
  MISSED_SHIFT_HAPPENED_UNVERIFIED_STATUS
);

// M. One side 8, other 1–7 → disputed
assert.equal(
  resolveMissedShiftOutcome("nanny_no_show", "shift_happened_without_app_start"),
  "disputed"
);
assert.equal(
  resolveMissedShiftOutcome("shift_happened_without_app_start", "forgot_shift"),
  "disputed"
);
assert.equal(missedShiftOutcomeToStatus("disputed"), MISSED_SHIFT_DISPUTED_STATUS);
assert.equal(resolveMissedShiftOutcome("nanny_no_show", null), "awaiting_other_side");
assert.equal(
  missedShiftOutcomeToStatus("awaiting_other_side"),
  MISSED_SHIFT_AWAITING_REASON_STATUS
);

// N. Missed shift not payable
for (const status of [
  "awaiting_missed_shift_reason",
  "did_not_occur",
  "happened_unverified",
  "missed_shift_disputed"
] as const) {
  assert.equal(isBookingBlockedFromPaymentByMissedShift(status), true);
  assert.equal((PAYABLE_BOOKING_STATUSES as readonly string[]).includes(status), false);
}

const charge = read("lib/billing/compute-shift-charge.ts");
assert.match(charge, /isBookingBlockedFromPaymentByMissedShift/);

// O. Does not trigger mandatory rating
for (const status of [
  "awaiting_missed_shift_reason",
  "did_not_occur",
  "happened_unverified",
  "missed_shift_disputed"
] as const) {
  assert.equal(isBookingBlockedFromMandatoryRating(status), true);
}
const rating = read("lib/ratings/submit-session-rating.ts");
assert.match(rating, /isBookingBlockedFromMandatoryRating/);
assert.doesNotMatch(parentDash, /inSettlement[\s\S]{0,200}did_not_occur/);

// P. did_not_occur has no rating/review flow
const card = read("components/bookings/missed-shift-clarification-card.tsx");
assert.doesNotMatch(card, /optionalFeedback/);
assert.doesNotMatch(card, /persistDismissedMissedShiftFeedbackId/);
assert.doesNotMatch(card, /submitSessionRating/);
assert.doesNotMatch(card, /האם תרצו לדרג את הצד השני ולהוסיף חוות דעת\?/);
assert.doesNotMatch(card, /כן, לדרג/);
assert.doesNotMatch(card, /לא עכשיו/);
assert.equal("optionalFeedbackTitle" in MISSED_SHIFT_COPY, false);
assert.doesNotMatch(read("lib/bookings/missed-shift-client.ts"), /OPTIONAL_FEEDBACK_KEY|persistDismissedMissedShiftFeedbackId/);

// Q. Existing stuck approved booking is reconciled
assert.equal(RECONCILE_UNSTARTED_PAST_BOOKINGS_RPC, "reconcile_unstarted_past_bookings");
assert.match(sql, /create or replace function public.reconcile_unstarted_past_bookings/);
assert.match(sql, /status = 'approved'/);
assert.match(sql, /end_time < now\(\)/);
assert.match(sql, /actual_start_time is null/);
assert.match(sql, /awaiting_missed_shift_reason/);
assert.match(read("lib/bookings/todays-linked-booking.ts"), /reconcileUnstartedPastBookings/);
assert.match(read("app/parent/dashboard/page.tsx"), /reconcileUnstartedPastBookings/);

// R. Unauthorized user cannot submit
assert.equal(SUBMIT_MISSED_SHIFT_REASON_RPC, "submit_missed_shift_reason");
assert.match(sql, /raise exception 'not authorized for booking'/);
assert.equal(mapClientError("not authorized for booking"), "אין הרשאה לדווח על משמרת זו.");
assert.equal(mapClientError("not authorized for booking"), "אין הרשאה לדווח על משמרת זו.");

// Copy + reason codes
assert.equal(MISSED_SHIFT_COPY.title, "המשמרת לא התקיימה");
assert.equal(MISSED_SHIFT_REASON_CODES.length, 8);
assert.equal(MISSED_SHIFT_REASON_LABELS.nanny_no_show, "הנני לא הגיעה.");
assert.equal(
  MISSED_SHIFT_REASON_LABELS.shift_happened_without_app_start,
  "המשמרת התקיימה בפועל, אבל אף אחד לא הפעיל אותה באפליקציה."
);
assert.ok(isMissedShiftReasonCode("forgot_shift"));
assert.equal(isMissedShiftReasonCode("something_else"), false);
assert.equal(missedShiftStatusLabel("did_not_occur"), "לא התקיימה");
assert.equal(missedShiftStatusLabel("happened_unverified"), "התקיימה ללא הפעלה — ממתינה לאימות");
assert.equal(missedShiftStatusLabel("missed_shift_disputed"), "דורשת בירור");
assert.equal(missedShiftStatusLabel("awaiting_missed_shift_reason"), "ממתינה לעדכון");

const body = formatMissedShiftClarificationBody(pastUnstarted);
assert.match(body, /לא התקיימה ולא נרשמה בה התחלה/);

assert.equal(isCanonicalNotificationKind("missed_shift_clarification"), true);
assert.equal(
  notificationHrefForKind("missed_shift_clarification", "parent", { booking_id: "b1" }),
  "/parent/dashboard"
);
assert.match(privacySafeBodyForKind("missed_shift_clarification"), /המשמרת לא התקיימה/);

assert.match(sql, /end_time >= now\(\)/);
assert.match(sql, /grant execute on function public.submit_missed_shift_reason/);
assert.match(sql, /revoke insert, update, delete on public.booking_missed_shift_reports from authenticated/);

const constants = read("lib/bookings/constants.ts");
assert.match(constants, /awaiting_missed_shift_reason/);
assert.match(constants, /did_not_occur/);
assert.match(constants, /happened_unverified/);
assert.match(constants, /missed_shift_disputed/);

assert.match(read("app/parent/history/page.tsx"), /missedShiftStatusLabel/);
assert.match(read("app/sitter/shifts/page.tsx"), /missedShiftStatusLabel/);
assert.match(read("lib/bookings/sitter-start-shift.ts"), /scheduledEndHasPassed/);

// +30-minute auto-cancel is retired. Stay approved until scheduled end.
const evening = booking({
  booking_date: TODAY,
  start_time: "2026-08-30T20:00:00.000Z",
  end_time: "2026-08-30T23:30:00.000Z"
});
const at2029 = Date.parse("2026-08-30T20:29:00.000Z");
const at2031 = Date.parse("2026-08-30T20:31:00.000Z");
const at2200 = Date.parse("2026-08-30T22:00:00.000Z");
const afterEnd = Date.parse("2026-08-30T23:31:00.000Z");

assert.equal(shouldEnterMissedShiftClarification(evening, at2029), false);
assert.equal(evening.status, "approved");
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: new Date(at2029),
    scheduledStart: evening.start_time,
    bookingStatus: "approved"
  }),
  false
);

assert.equal(shouldEnterMissedShiftClarification(evening, at2031), false);
assert.equal(evening.status, "approved");
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: new Date(at2031),
    scheduledStart: evening.start_time,
    bookingStatus: "approved"
  }),
  false
);

assert.equal(shouldEnterMissedShiftClarification(evening, at2200), false);
assert.equal(evening.status, "approved");
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: new Date(at2200),
    scheduledStart: evening.start_time,
    bookingStatus: "approved"
  }),
  false
);

assert.equal(shouldEnterMissedShiftClarification(evening, afterEnd), true);
assert.equal(shouldEnterMissedShiftClarification({ ...evening, status: "cancelled", cancelled_at: "2026-08-30T21:00:00.000Z" }, afterEnd), false);
assert.equal(
  shouldEnterMissedShiftClarification(
    { ...evening, status: "parent_started", actual_start_time: "2026-08-30T20:05:00.000Z" },
    afterEnd
  ),
  false
);
assert.equal(shouldEnterMissedShiftClarification({ ...evening, status: "completed" }, afterEnd), false);

const disableNoStartSql = read("supabase/migrations/20260830130000_disable_no_start_auto_cancel.sql");
const disableFn = disableNoStartSql.slice(
  disableNoStartSql.indexOf("create or replace function public.cancel_approved_bookings_without_start")
);
assert.match(disableFn, /return 0;/);
assert.doesNotMatch(disableFn, /create_canonical_notification/);
assert.doesNotMatch(disableFn, /cancellation_message = 'no_start_confirmation'/);
assert.doesNotMatch(disableFn, /'shift_cancelled_no_start'/);
assert.doesNotMatch(read("lib/bookings/no-start-cancellation.ts"), /start_time \+ interval '30 minutes'/);
assert.doesNotMatch(
  read("lib/bookings/no-start-cancellation.ts"),
  /NO_START_CANCEL_LEAD_MINUTES \* 60 \* 1000/
);

console.log("test-missed-shift-lifecycle: ok");
