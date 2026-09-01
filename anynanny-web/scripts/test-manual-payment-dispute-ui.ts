import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateManualPaymentTransition,
  parentHasUnresolvedPaymentDispute,
  PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE
} from "../lib/billing/manual-payment-lifecycle";
import {
  AWAITING_SITTER_CONFIRMATION_HEADING,
  MANUAL_PAYMENT_HEADING,
  MANUAL_PAYMENT_PAID_BUTTON,
  MANUAL_PAYMENT_REPORTED_NOTIFICATION,
  MANUAL_PAYMENT_RESOLVED_REPORTED_NOTIFICATION,
  PARENT_PAYMENT_DISPUTE_SITTER_DENIED_MESSAGE,
  PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON,
  PAYMENT_DISPUTE_HEADING,
  PAYMENT_DISPUTE_PARENT_HEADING,
  parentMayReadManualPaymentDestinations,
  parentMayResolveManualPaymentDispute,
  resolveParentManualSettlementStep,
  resolveSitterManualPaymentStep,
  SITTER_CONFIRM_RECEIVED_BUTTON,
  SITTER_DENY_RECEIVED_BUTTON,
  SITTER_MANUAL_PAYMENT_PROMPT
} from "../lib/billing/manual-payment-ui";
import {
  bookingPaymentStatusLabel,
  parentCompletedShiftPaymentActionLabel
} from "../lib/bookings/payment-status-label";
import {
  isCanonicalNotificationKind,
  notificationDedupeKey,
  notificationHrefForKind
} from "../lib/notifications/kinds";
import { privacySafeBodyForKind } from "../lib/push/payload";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const dashboard = read("components/parent/parent-dashboard-client.tsx");
const sitterDashboard = read("app/sitter/dashboard/page.tsx");
const resolveRoute = read("app/api/parent/resolve-manual-payment-dispute/route.ts");
const resolveServer = read("lib/billing/parent-manual-payment-server.ts");
const reportRoute = read("app/api/parent/report-manual-payment/route.ts");
const createNotif = read("lib/notifications/create-notification.ts");
const createBooking = read("lib/bookings/create-booking.ts");
const approveBooking = read("lib/bookings/sitter-pending-bookings.ts");
const hypFinalize = read("lib/billing/finalize-hyp-payment.ts");
const lifecycleSql = read("supabase/migrations/20260901120000_manual_payment_lifecycle.sql");

// 1. payment_dispute → parent sees בירור תשלום / בבירור תשלום
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "payment_dispute" }), "בירור תשלום");
assert.equal(PAYMENT_DISPUTE_HEADING, "בירור תשלום");
assert.equal(PAYMENT_DISPUTE_PARENT_HEADING, "בבירור תשלום");
assert.equal(resolveParentManualSettlementStep({ paymentStatus: "payment_dispute" }), "dispute");
assert.match(dashboard, /PAYMENT_DISPUTE_PARENT_HEADING/);
assert.match(dashboard, /בבירור תשלום — לחצו להרחבה/);

// 2. Parent sees הסדרתי את התשלום + sitter-denied copy; no method form / שלם עכשיו
assert.equal(PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON, "הסדרתי את התשלום");
assert.equal(
  PARENT_PAYMENT_DISPUTE_SITTER_DENIED_MESSAGE,
  "הנני דיווחה שהתשלום טרם התקבל."
);
assert.match(dashboard, /PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON/);
assert.match(dashboard, /PARENT_PAYMENT_DISPUTE_SITTER_DENIED_MESSAGE/);
assert.equal(parentCompletedShiftPaymentActionLabel({ paymentStatus: "payment_dispute" }), null);
assert.match(dashboard, /settlementStep !== "payment"/);
assert.doesNotMatch(dashboard, /PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE/);

const disputeUiStart = dashboard.indexOf('inSettlement && settlementStep === "dispute"');
const disputeUiEnd = dashboard.indexOf('inSettlement && settlementStep === "waiting_sitter_rating"', disputeUiStart);
assert.ok(disputeUiStart >= 0 && disputeUiEnd > disputeUiStart);
const disputeUi = dashboard.slice(disputeUiStart, disputeUiEnd);
assert.match(disputeUi, /PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON/);
assert.match(disputeUi, /PARENT_PAYMENT_DISPUTE_SITTER_DENIED_MESSAGE/);
assert.doesNotMatch(disputeUi, /ManualPaymentPanel/);
assert.doesNotMatch(disputeUi, /MANUAL_PAYMENT_HEADING/);
assert.doesNotMatch(disputeUi, new RegExp(MANUAL_PAYMENT_HEADING));
assert.doesNotMatch(disputeUi, /שלם עכשיו/);
assert.doesNotMatch(disputeUi, new RegExp(MANUAL_PAYMENT_PAID_BUTTON));

// 3. Press → report_manual_payment reuses stored method → awaiting_sitter_confirmation
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "report",
    actor: "parent",
    paymentStatus: "payment_dispute",
    paymentMethod: "bit"
  }),
  { ok: true, nextStatus: "awaiting_sitter_confirmation", noop: false }
);
const resolveFn = resolveServer.slice(
  resolveServer.indexOf("export async function runParentResolveManualPaymentDispute")
);
assert.match(resolveRoute, /runParentResolveManualPaymentDispute/);
assert.match(resolveFn, /report_manual_payment/);
assert.match(resolveFn, /p_payment_method: paymentMethod/);
assert.match(resolveFn, /row\.payment_method/);
assert.doesNotMatch(resolveRoute, /paymentMethod\?:/);
assert.doesNotMatch(resolveFn, /loadAuthorizedManualPaymentDestinations/);
assert.match(dashboard, /\/api\/parent\/resolve-manual-payment-dispute/);
assert.match(dashboard, /lockSettlement\("waiting_sitter"\)/);
assert.equal(
  resolveParentManualSettlementStep({ paymentStatus: "awaiting_sitter_confirmation" }),
  "waiting_sitter"
);
assert.equal(AWAITING_SITTER_CONFIRMATION_HEADING, "ממתין לאישור הנני");
assert.match(dashboard, /AWAITING_SITTER_CONFIRMATION_HEADING/);

assert.equal(
  parentMayResolveManualPaymentDispute({
    actorId: "p1",
    bookingParentId: "p1",
    paymentStatus: "payment_dispute",
    paymentRail: "manual",
    paymentMethod: "cash"
  }).ok,
  true
);
assert.deepEqual(
  parentMayResolveManualPaymentDispute({
    actorId: "p1",
    bookingParentId: "p1",
    paymentStatus: "payment_dispute",
    paymentRail: "manual",
    paymentMethod: "paybox"
  }),
  { ok: true, paymentMethod: "paybox", noop: false }
);

// 4. Restriction lifts as soon as status leaves payment_dispute (no suspended_at)
assert.equal(parentHasUnresolvedPaymentDispute(["payment_dispute"]), true);
assert.equal(parentHasUnresolvedPaymentDispute(["awaiting_sitter_confirmation"]), false);
assert.equal(PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE, "קיים תשלום שטרם אושר. יש להסדיר אותו לפני הזמנה חדשה.");
assert.match(createBooking, /parent_has_unresolved_payment_dispute/);
assert.match(createBooking, /PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE/);
assert.match(approveBooking, /parent_has_unresolved_payment_dispute/);
assert.match(lifecycleSql, /b\.payment_status = 'payment_dispute'/);
assert.doesNotMatch(resolveFn, /suspended_at/);
assert.doesNotMatch(dashboard, /suspended_at/);

// 5. Sitter notification: resolved_reported, not a duplicate of reported
assert.equal(MANUAL_PAYMENT_RESOLVED_REPORTED_NOTIFICATION.kind, "manual_payment_resolved_reported");
assert.equal(
  MANUAL_PAYMENT_RESOLVED_REPORTED_NOTIFICATION.title,
  "ההורה דיווח שהתשלום הוסדר"
);
assert.equal(
  MANUAL_PAYMENT_RESOLVED_REPORTED_NOTIFICATION.body,
  "יש לאשר האם התשלום התקבל."
);
assert.equal(isCanonicalNotificationKind("manual_payment_resolved_reported"), true);
assert.equal(
  notificationHrefForKind("manual_payment_resolved_reported", "sitter", { booking_id: "b1" }),
  "/sitter/dashboard"
);
assert.equal(
  privacySafeBodyForKind("manual_payment_resolved_reported"),
  "יש לאשר האם התשלום התקבל."
);
assert.equal(
  notificationDedupeKey("manual_payment_resolved_reported", {
    bookingId: "b1",
    resolvedAt: "ts-2"
  }),
  "b1:ts-2"
);
assert.match(resolveFn, /notifySitterManualPaymentResolvedReported/);
assert.doesNotMatch(resolveFn, /notifySitterManualPaymentReported/);
assert.match(reportRoute, /notifySitterManualPaymentReported/);
assert.doesNotMatch(reportRoute, /notifySitterManualPaymentResolvedReported/);
assert.equal(MANUAL_PAYMENT_REPORTED_NOTIFICATION.kind, "manual_payment_reported");
assert.match(createNotif, /manual_payment_reported/);
assert.match(createNotif, /manual_payment_confirmed/);
assert.match(createNotif, /manual_payment_denied/);
assert.match(createNotif, /manual_payment_resolved_reported/);
assert.match(resolveFn, /if \(!noop\)/);

// 6. Sitter dashboard restores existing yes/no panel — no parallel flow
assert.equal(resolveSitterManualPaymentStep("awaiting_sitter_confirmation"), "confirm");
assert.equal(
  SITTER_MANUAL_PAYMENT_PROMPT,
  "ההורה דיווח שהתשלום בוצע. האם קיבלת את התשלום?"
);
assert.equal(SITTER_CONFIRM_RECEIVED_BUTTON, "כן, קיבלתי");
assert.equal(SITTER_DENY_RECEIVED_BUTTON, "לא קיבלתי");
assert.match(sitterDashboard, /SitterManualPaymentConfirmPanel/);
assert.match(sitterDashboard, /showManualConfirm/);
assert.doesNotMatch(sitterDashboard, /הסדרתי את התשלום/);
assert.doesNotMatch(sitterDashboard, /resolve-manual-payment-dispute/);

// 7. Confirm → rating → paid
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "confirm",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_confirmation"
  }),
  { ok: true, nextStatus: "awaiting_sitter_rating", noop: false }
);
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "mark_paid",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_rating",
    hasSitterRating: true
  }),
  { ok: true, nextStatus: "paid", noop: false }
);

// 8. Deny again → payment_dispute
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "deny",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_confirmation"
  }),
  { ok: true, nextStatus: "payment_dispute", noop: false }
);

// 9. Refresh/relogin from DB
assert.match(dashboard, /resolveParentManualSettlementStep/);
assert.match(sitterDashboard, /fetchSitterActionableManualPayment/);
assert.match(sitterDashboard, /resolveSitterManualPaymentStep/);

// 10. Wrong parent / processor / unpaid cannot resolve
assert.equal(
  parentMayResolveManualPaymentDispute({
    actorId: "p2",
    bookingParentId: "p1",
    paymentStatus: "payment_dispute",
    paymentRail: "manual",
    paymentMethod: "cash"
  }).ok,
  false
);
assert.deepEqual(
  parentMayResolveManualPaymentDispute({
    actorId: "p2",
    bookingParentId: "p1",
    paymentStatus: "payment_dispute",
    paymentRail: "manual",
    paymentMethod: "cash"
  }),
  { ok: false, reason: "not_owner" }
);
assert.deepEqual(
  parentMayResolveManualPaymentDispute({
    actorId: "p1",
    bookingParentId: "p1",
    paymentStatus: "unpaid",
    paymentRail: "manual",
    paymentMethod: "cash"
  }),
  { ok: false, reason: "invalid_from_status" }
);
assert.deepEqual(
  parentMayResolveManualPaymentDispute({
    actorId: "p1",
    bookingParentId: "p1",
    paymentStatus: "payment_dispute",
    paymentRail: "processor",
    paymentMethod: "cash"
  }),
  { ok: false, reason: "processor_rail" }
);
assert.deepEqual(
  parentMayResolveManualPaymentDispute({
    actorId: "p1",
    bookingParentId: "p1",
    paymentStatus: "payment_dispute",
    paymentRail: "manual",
    paymentMethod: "credit_card"
  }),
  { ok: false, reason: "invalid_method" }
);
assert.deepEqual(
  parentMayResolveManualPaymentDispute({
    actorId: "p1",
    bookingParentId: "p1",
    paymentStatus: "payment_dispute",
    paymentRail: "manual",
    paymentMethod: "apple_pay"
  }),
  { ok: false, reason: "invalid_method" }
);
assert.match(resolveFn, /\.eq\("parent_id", actorId\)/);
assert.match(resolveFn, /אין הרשאה להסדיר תשלום עבור הזמנה זו/);
assert.doesNotMatch(dashboard, /\.update\(\s*\{[^}]*payment_status/);
assert.doesNotMatch(resolveRoute, /payment_status:/);

const destinationsGate = parentMayReadManualPaymentDestinations({
  actorId: "p1",
  bookingParentId: "p1",
  bookingStatus: "completed",
  paymentStatus: "payment_dispute",
  hasParentRating: true
});
assert.equal(destinationsGate.ok, false);

// 11. No HYP / processor behavior changes
assert.match(hypFinalize, /payment_status: "paid"/);
assert.doesNotMatch(hypFinalize, /report_manual_payment|resolve-manual-payment-dispute|payment_dispute/);
assert.doesNotMatch(dashboard, /Apple Pay|Google Pay|כרטיס אשראי/);
assert.doesNotMatch(resolveFn, /credit_card|apple_pay|google_pay/);

console.log("test-manual-payment-dispute-ui: PASS");
