import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateManualPaymentTransition
} from "../lib/billing/manual-payment-lifecycle";
import {
  AWAITING_SITTER_CONFIRMATION_COPY,
  AWAITING_SITTER_CONFIRMATION_HEADING,
  AWAITING_SITTER_RATING_HEADING,
  eligibleManualPaymentMethods,
  MANUAL_PAYMENT_CASH_COPY,
  MANUAL_PAYMENT_HEADING,
  MANUAL_PAYMENT_PAID_BUTTON,
  MANUAL_PAYMENT_REPORTED_NOTIFICATION,
  manualPaymentReportedNotificationCopy,
  parentMayReadManualPaymentDestinations,
  parentReportedPaidByMethodCopy,
  PAYMENT_DISPUTE_HEADING,
  PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON,
  resolveParentManualSettlementStep
} from "../lib/billing/manual-payment-ui";
import {
  bookingPaymentStatusLabel,
  isBookingPaymentPaid,
  parentCompletedShiftPaymentActionLabel
} from "../lib/bookings/payment-status-label";
import {
  isCanonicalNotificationKind,
  notificationHrefForKind
} from "../lib/notifications/kinds";
import { privacySafeBodyForKind } from "../lib/push/payload";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const dashboard = read("components/parent/parent-dashboard-client.tsx");
const panel = read("components/billing/ManualPaymentPanel.tsx");
const uiCopy = read("lib/billing/manual-payment-ui.ts");
const destinationsRoute = read("app/api/parent/manual-payment-destinations/route.ts");
const reportRoute = read("app/api/parent/report-manual-payment/route.ts");
const destinationsServer = read("lib/billing/parent-manual-payment-server.ts");
const paymentFactory = read("components/billing/PaymentFactory.tsx");
const publicProfile = read("lib/sitter/fetch-parent-sitter-profile.ts");
const publicSearch = read("lib/sitter/parent-sitter-search.ts");
const publicApi = read("app/api/parent/sitter/[id]/public/route.ts");

// 1. Completed shift + no parent rating → payment UI remains blocked
assert.match(dashboard, /דרגו את הבייביסיטר לפני התשלום/);
assert.match(dashboard, /lockSettlement\(\s*rated \? "payment" : "rating"\s*\)/);
assert.equal(
  parentMayReadManualPaymentDestinations({
    actorId: "p1",
    bookingParentId: "p1",
    bookingStatus: "completed",
    paymentStatus: "unpaid",
    hasParentRating: false
  }).ok,
  false
);

// 2. After parent rates → manual methods appear (not HYP processor rails)
assert.match(dashboard, /lockSettlement\("payment"\)/);
assert.match(dashboard, /ManualPaymentPanel/);
assert.match(panel, /MANUAL_PAYMENT_METHOD_LABELS/);
assert.match(uiCopy, /מזומן/);
assert.match(uiCopy, /Bit/);
assert.match(uiCopy, /PayBox/);
assert.doesNotMatch(panel, /כרטיס אשראי|Apple Pay|Google Pay/);
assert.doesNotMatch(uiCopy, /כרטיס אשראי|Apple Pay|Google Pay/);
assert.doesNotMatch(dashboard, /PaymentFactory/);
assert.doesNotMatch(paymentFactory, /מזומן/);
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: false, payboxConfigured: false }), [
  "cash"
]);

// 3. Cash → שילמתי → awaiting_sitter_confirmation
assert.match(panel, /MANUAL_PAYMENT_PAID_BUTTON/);
assert.match(panel, /MANUAL_PAYMENT_CASH_COPY/);
assert.equal(MANUAL_PAYMENT_PAID_BUTTON, "שילמתי");
assert.equal(MANUAL_PAYMENT_CASH_COPY, "לאחר מסירת התשלום לנני, לחצו על 'שילמתי'.");
assert.match(dashboard, /\/api\/parent\/report-manual-payment/);
assert.match(reportRoute, /report_manual_payment/);
assert.match(reportRoute, /p_payment_method/);
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "report",
    actor: "parent",
    paymentStatus: "unpaid",
    paymentMethod: "cash",
    hasParentRating: true,
    bookingStatus: "completed"
  }),
  {
    ok: true,
    nextStatus: "awaiting_sitter_confirmation",
    noop: false
  }
);

// 4–5. Bit / PayBox only when configured
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: true, payboxConfigured: false }), [
  "cash",
  "bit"
]);
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: false, payboxConfigured: true }), [
  "cash",
  "paybox"
]);
assert.match(destinationsServer, /parent_manual_payment_destinations/);
assert.match(destinationsServer, /isValidIsraeliMobile\(bitPhone\)/);
assert.match(destinationsServer, /isValidIsraeliMobile\(phone\)/);
assert.match(destinationsServer, /parseAuthorizedPayboxPaymentLink/);
assert.match(destinationsServer, /paybox_link/);
assert.match(reportRoute, /methodHasAuthorizedDestination/);
assert.match(dashboard, /canReportManualPayment/);
assert.match(panel, /availableManualPaymentMethods/);

// 6. Refresh after report still shows awaiting confirmation
assert.equal(
  resolveParentManualSettlementStep({ paymentStatus: "awaiting_sitter_confirmation" }),
  "waiting_sitter"
);
assert.match(dashboard, /resolveParentManualSettlementStep/);
assert.match(dashboard, /lockSettlement\(lifecycleStep\)/);
assert.match(dashboard, /AWAITING_SITTER_CONFIRMATION_HEADING/);
assert.match(dashboard, /AWAITING_SITTER_CONFIRMATION_COPY/);
assert.equal(AWAITING_SITTER_CONFIRMATION_HEADING, "ממתין לאישור הנני");
assert.equal(
  AWAITING_SITTER_CONFIRMATION_COPY,
  "דיווחנו לנני שהתשלום בוצע. לאחר אישור קבלת התשלום נמשיך לסגירת המשמרת."
);

// 7. Duplicate שילמתי is a no-op
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "report",
    actor: "parent",
    paymentStatus: "awaiting_sitter_confirmation",
    paymentMethod: "cash",
    hasParentRating: true,
    bookingStatus: "completed"
  }),
  { ok: true, nextStatus: "awaiting_sitter_confirmation", noop: true }
);
assert.match(dashboard, /manualPaymentInFlightRef/);

// 8. Parent cannot access another sitter's destination
assert.equal(
  parentMayReadManualPaymentDestinations({
    actorId: "parent-a",
    bookingParentId: "parent-b",
    bookingStatus: "completed",
    paymentStatus: "unpaid",
    hasParentRating: true
  }).ok,
  false
);
assert.match(destinationsRoute, /bookingId/);
assert.doesNotMatch(destinationsRoute, /sitterId/);
assert.match(destinationsServer, /parentMayReadManualPaymentDestinations/);
assert.match(destinationsServer, /\.eq\("parent_id", actorId\)/);
assert.doesNotMatch(publicProfile, /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);
assert.doesNotMatch(publicSearch, /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);
assert.doesNotMatch(publicApi, /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);

// 9. Existing HYP paid still שולם
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "paid" }), "שולם");
assert.equal(isBookingPaymentPaid({ paymentStatus: "paid" }), true);
assert.equal(
  bookingPaymentStatusLabel({ paymentStatus: "unpaid", paidAt: "2026-08-25T00:00:00Z" }),
  "שולם"
);

// 10. New payment statuses have correct Hebrew labels
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "unpaid" }), "ממתינה לתשלום");
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "pending_checkout" }), "התשלום לא הושלם");
assert.equal(
  bookingPaymentStatusLabel({ paymentStatus: "awaiting_sitter_confirmation" }),
  "ממתין לאישור הנני"
);
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "payment_dispute" }), "בירור תשלום");
assert.equal(
  bookingPaymentStatusLabel({ paymentStatus: "awaiting_sitter_rating" }),
  "ממתין לדירוג מבייביסיטר"
);
assert.equal(AWAITING_SITTER_RATING_HEADING, "ממתין לדירוג מבייביסיטר");
assert.match(dashboard, /ממתין לדירוג מבייביסיטר/);
assert.doesNotMatch(dashboard, /ממתין לדירוג הנני/);
assert.match(dashboard, /lifecycleStep === "idle_paid"/);
assert.match(dashboard, /clearToIdleDashboard\(\)/);
assert.equal(resolveParentManualSettlementStep({ paymentStatus: "paid" }), "idle_paid");
assert.equal(parentCompletedShiftPaymentActionLabel({ paymentStatus: "payment_dispute" }), null);

// Dispute UI: status + הסדרתי (Phase 1d). No שלם עכשיו.
assert.equal(resolveParentManualSettlementStep({ paymentStatus: "payment_dispute" }), "dispute");
assert.equal(PAYMENT_DISPUTE_HEADING, "בירור תשלום");
assert.equal(PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON, "הסדרתי את התשלום");
assert.match(dashboard, /PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON/);
assert.match(dashboard, /PAYMENT_DISPUTE_PARENT_HEADING/);
assert.doesNotMatch(dashboard, /PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE/);

// Notification — method-specific copy from booking.payment_method
assert.equal(MANUAL_PAYMENT_REPORTED_NOTIFICATION.kind, "manual_payment_reported");
assert.equal(parentReportedPaidByMethodCopy("cash"), "ההורה דיווח ששילם במזומן");
assert.equal(parentReportedPaidByMethodCopy("bit"), "ההורה דיווח ששילם ב-Bit");
assert.equal(parentReportedPaidByMethodCopy("paybox"), "ההורה דיווח ששילם ב-PayBox");
assert.deepEqual(manualPaymentReportedNotificationCopy("cash"), {
  title: "ההורה דיווח ששילם במזומן",
  body: "ההורה דיווח ששילם במזומן"
});
assert.deepEqual(manualPaymentReportedNotificationCopy("bit"), {
  title: "ההורה דיווח ששילם ב-Bit",
  body: "ההורה דיווח ששילם ב-Bit"
});
assert.deepEqual(manualPaymentReportedNotificationCopy("paybox"), {
  title: "ההורה דיווח ששילם ב-PayBox",
  body: "ההורה דיווח ששילם ב-PayBox"
});
assert.equal(isCanonicalNotificationKind("manual_payment_reported"), true);
assert.equal(
  notificationHrefForKind("manual_payment_reported", "sitter", { booking_id: "b1" }),
  "/sitter/dashboard"
);
assert.equal(
  privacySafeBodyForKind("manual_payment_reported", { payment_method: "bit" }),
  "ההורה דיווח ששילם ב-Bit"
);
assert.match(reportRoute, /notifySitterManualPaymentReported/);
assert.match(reportRoute, /payment_method/);
assert.match(reportRoute, /storedMethod/);
assert.doesNotMatch(reportRoute, /confirm_manual_payment_received/);
assert.match(read("lib/notifications/create-notification.ts"), /manualPaymentReportedNotificationCopy/);

assert.equal(MANUAL_PAYMENT_HEADING, "כמה נוח לך לשלם?");
assert.match(panel, /MANUAL_PAYMENT_HEADING/);

console.log("test-manual-payment-parent-ui: PASS");
