import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isUpcomingOrActiveCalendarShift, isActiveCalendarShiftForViewer } from "../lib/bookings/calendar-shift-filters";
import {
  CANCELLATION_COPY,
  CANCELLATION_MESSAGE_MAX_LENGTH,
  cancellationHistoryLabel,
  formatCancellationShiftWhen,
  formatStoredCancellationMessage,
  incomingCancellationSentence,
  isIncomingCancellationRequest,
  isIncomingPendingCancellation,
  isOutgoingCancellationRequest,
  isScheduledShiftCancellable,
  isCancellationRequestPending,
  isTemporarilyVisibleCancelledShift,
  isUnacknowledgedApprovedCancellation,
  sanitizeCancellationMessage
} from "../lib/bookings/cancellation-request";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const approved = {
  id: "b1",
  status: "approved" as const,
  bookingDate: "2026-08-26",
  startTime: "2026-08-26T03:00:00",
  endTime: "2026-08-26T13:00:00",
  partnerName: "אדי",
  paymentStatus: "unpaid" as const,
  cancellationRequestedBy: null,
  cancellationRequestedRole: null,
  cancellationRequestedAt: null,
  cancellationMessage: null,
  cancellationApprovedBy: null,
  cancellationApprovedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  cancellationAcknowledgedAt: null
};

const pendingFromParent = {
  ...approved,
  cancellationRequestedBy: "parent-1",
  cancellationRequestedRole: "parent" as const,
  cancellationRequestedAt: "2026-08-18T12:00:00.000Z",
  cancellationMessage: "שינוי תוכניות"
};

const completed = { ...approved, status: "completed" as const };
const cancelled = {
  ...approved,
  status: "cancelled" as const,
  cancelledAt: "2026-08-18T13:00:00.000Z",
  cancellationRequestedBy: "parent-1",
  cancellationRequestedRole: "parent" as const
};
const paid = { ...approved, paymentStatus: "paid" as const };
const live = { ...approved, status: "parent_started" as const };

assert.equal(isScheduledShiftCancellable(approved), true);
assert.equal(isScheduledShiftCancellable(completed), false);
assert.equal(isScheduledShiftCancellable(cancelled), false);
assert.equal(isScheduledShiftCancellable(paid), false);
assert.equal(isScheduledShiftCancellable(live), false);

assert.equal(isCancellationRequestPending(pendingFromParent), true);
assert.equal(isOutgoingCancellationRequest(pendingFromParent, "parent-1"), true);
assert.equal(isIncomingCancellationRequest(pendingFromParent, "sitter-1"), true);
assert.equal(isOutgoingCancellationRequest(pendingFromParent, "sitter-1"), false);
assert.equal(isIncomingCancellationRequest(pendingFromParent, "parent-1"), false);
assert.equal(isCancellationRequestPending(approved), false);

assert.equal(cancellationHistoryLabel("parent"), "משמרת בוטלה לבקשת ההורה");
assert.equal(cancellationHistoryLabel("sitter"), "משמרת בוטלה לבקשת הנני");
assert.equal(
  formatStoredCancellationMessage("no_start_confirmation"),
  "המשמרת בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת."
);
assert.equal(formatStoredCancellationMessage("שינוי תוכניות"), "שינוי תוכניות");
assert.equal(formatCancellationShiftWhen(approved), "26/08/2026, 03:00–13:00");
assert.match(
  incomingCancellationSentence(approved, "אדי"),
  /אדי ביקש לבטל את המשמרת שנקבעה ל־26\/08\/2026 בשעות/
);

assert.equal(isIncomingPendingCancellation(pendingFromParent, "sitter-1"), true);
assert.equal(isIncomingPendingCancellation(pendingFromParent, "parent-1"), false);
assert.equal(isUnacknowledgedApprovedCancellation(cancelled, "parent-1"), true);
assert.equal(isUnacknowledgedApprovedCancellation(cancelled, "sitter-1"), false);
assert.equal(isTemporarilyVisibleCancelledShift(cancelled, "parent-1"), true);
assert.equal(isTemporarilyVisibleCancelledShift({ ...cancelled, cancellationAcknowledgedAt: "2026-08-18T14:00:00.000Z" }, "parent-1"), false);
assert.equal(isActiveCalendarShiftForViewer(cancelled, "parent-1", Date.parse("2026-08-18T12:00:00")), true);
assert.equal(isActiveCalendarShiftForViewer(cancelled, "sitter-1", Date.parse("2026-08-18T12:00:00")), false);

assert.equal(sanitizeCancellationMessage("  שלום <b>עולם</b>  "), "שלום עולם");
assert.equal(sanitizeCancellationMessage("   "), null);
assert.equal(sanitizeCancellationMessage("<script>x</script>"), "x");
assert.equal(
  sanitizeCancellationMessage("א".repeat(CANCELLATION_MESSAGE_MAX_LENGTH + 20))?.length,
  CANCELLATION_MESSAGE_MAX_LENGTH
);

assert.equal(
  isUpcomingOrActiveCalendarShift(
    {
      bookingDate: "2026-08-26",
      startTime: "2026-08-26T03:00:00",
      endTime: "2026-08-26T13:00:00",
      status: "cancelled"
    },
    Date.parse("2026-08-18T12:00:00")
  ),
  false
);

const migration = read("supabase/migrations/20260818153000_booking_cancellation_request.sql");
assert.match(migration, /request_booking_cancellation/);
assert.match(migration, /approve_booking_cancellation/);
assert.match(migration, /cancellation_requested_role/);
assert.match(migration, /cancellation_requested_by/);
assert.match(migration, /cancelled_by/);
assert.match(migration, /for update/);
assert.match(migration, /status = 'cancelled'/);
assert.match(migration, /booking_cancellation_requested/);
assert.match(migration, /booking_cancellation_approved/);
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /cannot approve own cancellation request/);
assert.match(migration, /already_pending/);
assert.doesNotMatch(migration, /refund_amount|charge_id|stripe_checkout|hyp_approval/i);

const parentCalendar = read("app/parent/calendar/page.tsx");
assert.match(parentCalendar, /פרופיל שמרטפית/);
assert.match(parentCalendar, /sitter_id=/);
assert.match(parentCalendar, /viewerRole="parent"/);
assert.match(parentCalendar, /onRequestCancellation/);
assert.match(parentCalendar, /ShiftCancellationRequestModal/);

assert.match(parentCalendar, /onAcknowledgeCancellation/);
assert.match(parentCalendar, /CancellationAttentionModals/);

const sitterShifts = read("app/sitter/shifts/page.tsx");
assert.match(sitterShifts, /CANCELLATION_COPY\.parentProfile/);
assert.match(sitterShifts, /parentId=/);
assert.match(sitterShifts, /viewerRole="sitter"/);
assert.match(sitterShifts, /\["completed", "cancelled"\]/);
assert.match(sitterShifts, /onAcknowledgeCancellation/);
assert.match(sitterShifts, /CancellationAttentionModals/);

const actions = read("components/bookings/scheduled-shift-actions.tsx");
assert.match(actions, /CANCELLATION_COPY\.requestButton/);
assert.match(actions, /CANCELLATION_COPY\.requestPending/);
assert.match(actions, /CANCELLATION_COPY\.receivedHeading/);
assert.match(actions, /CANCELLATION_COPY\.approve/);
assert.match(actions, /CANCELLATION_COPY\.contact/);
assert.doesNotMatch(actions, /דחיית ביטול/);

const requestModal = read("components/bookings/shift-cancellation-request-modal.tsx");
assert.match(requestModal, /CANCELLATION_COPY\.modalTitle/);
assert.match(requestModal, /CANCELLATION_COPY\.messageLabel/);
assert.match(requestModal, /CANCELLATION_COPY\.submit/);
assert.match(requestModal, /CANCELLATION_COPY\.back/);

const approveModal = read("components/bookings/shift-cancellation-approve-modal.tsx");
assert.match(approveModal, /CANCELLATION_COPY\.approveConfirmTitle/);
assert.match(approveModal, /CANCELLATION_COPY\.approveConfirm/);

const parentHistory = read("app/parent/history/page.tsx");
assert.match(parentHistory, /cancellationHistoryLabel/);
assert.match(parentHistory, /CANCELLATION_COPY\.messageHistoryLabel/);

const confirmed = read("components/sitter/sitter-confirmed-shifts.tsx");
assert.doesNotMatch(confirmed, /האם לבטל ולמחוק משמרת זו/);
assert.doesNotMatch(confirmed, /cancelSitterUpcomingShift/);
assert.match(confirmed, /ScheduledShiftActions/);

assert.equal(CANCELLATION_COPY.requestButton, "בקשת ביטול");
assert.equal(CANCELLATION_COPY.contact, "צור קשר");
assert.equal(CANCELLATION_COPY.parentProfile, "פרופיל ההורה");
assert.equal(CANCELLATION_COPY.sitterProfile, "פרופיל שמרטפית");

assert.equal(CANCELLATION_COPY.incomingTitle, "בקשת ביטול משמרת התקבלה");
assert.equal(CANCELLATION_COPY.approvedTitle, "ביטול המשמרת אושר");
assert.equal(CANCELLATION_COPY.later, "לא עכשיו");
assert.equal(CANCELLATION_COPY.closeHint, "לסגירה לחצו על X");

const parentDashboard = read("components/parent/parent-dashboard-client.tsx");
assert.match(parentDashboard, /CancellationAttentionDot/);
assert.match(parentDashboard, /יומן תיאום המשמרות/);
assert.doesNotMatch(parentDashboard, /cancellationAttention\.showDot[\s\S]*Messages/);

const sitterDashboard = read("app/sitter/dashboard/page.tsx");
assert.match(sitterDashboard, /CancellationAttentionDot/);
assert.match(sitterDashboard, /המשמרות שלי/);

const incomingModal = read("components/bookings/shift-cancellation-incoming-modal.tsx");
assert.match(incomingModal, /CANCELLATION_COPY\.incomingTitle/);
assert.match(incomingModal, /CANCELLATION_COPY\.later/);
assert.match(incomingModal, /CANCELLATION_COPY\.contact/);
assert.match(incomingModal, /CANCELLATION_COPY\.approve/);

const approvedModal = read("components/bookings/shift-cancellation-approved-modal.tsx");
assert.match(approvedModal, /CANCELLATION_COPY\.approvedTitle/);
assert.match(approvedModal, /CANCELLATION_COPY\.closeHint/);
assert.match(approvedModal, /onAcknowledge/);

const attentionClient = read("lib/bookings/cancellation-request.ts");
assert.match(attentionClient, /acknowledge_booking_cancellation/);
assert.match(attentionClient, /approve_booking_cancellation/);
assert.match(attentionClient, /cancellation_acknowledged_at/);

console.log("Booking cancellation request checks passed.");
