import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateManualPaymentTransition } from "../lib/billing/manual-payment-lifecycle";
import {
  MANUAL_PAYMENT_CONFIRMED_NOTIFICATION,
  MANUAL_PAYMENT_DENIED_NOTIFICATION,
  MANUAL_PAYMENT_METHOD_LABELS,
  PAYMENT_DISPUTE_HEADING,
  SITTER_AWAITING_RATING_LABEL,
  SITTER_CONFIRM_RECEIVED_BUTTON,
  SITTER_DENY_RECEIVED_BUTTON,
  SITTER_MANUAL_PAYMENT_PROMPT,
  resolveSitterManualPaymentStep
} from "../lib/billing/manual-payment-ui";
import {
  bookingPaymentStatusLabel,
  isBookingPaymentPaid
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

const dashboard = read("app/sitter/dashboard/page.tsx");
const panel = read("components/session/sitter-manual-payment-confirm-panel.tsx");
const confirmRoute = read("app/api/sitter/confirm-manual-payment/route.ts");
const denyRoute = read("app/api/sitter/deny-manual-payment/route.ts");
const actionServer = read("lib/billing/sitter-manual-payment-server.ts");
const fetchHelper = read("lib/billing/sitter-manual-payment.ts");
const ratingSubmit = read("lib/ratings/submit-session-rating.ts");
const parentDash = read("components/parent/parent-dashboard-client.tsx");
const hypFinalize = read("lib/billing/finalize-hyp-payment.ts");

// 1. awaiting_sitter_confirmation → כן / לא
assert.equal(resolveSitterManualPaymentStep("awaiting_sitter_confirmation"), "confirm");
assert.equal(SITTER_MANUAL_PAYMENT_PROMPT, "ההורה דיווח שהתשלום בוצע. האם קיבלת את התשלום?");
assert.equal(SITTER_CONFIRM_RECEIVED_BUTTON, "כן, קיבלתי");
assert.equal(SITTER_DENY_RECEIVED_BUTTON, "לא קיבלתי");
assert.match(dashboard, /SitterManualPaymentConfirmPanel/);
assert.match(dashboard, /showManualConfirm/);
assert.match(panel, /SITTER_CONFIRM_RECEIVED_BUTTON/);
assert.match(panel, /SITTER_DENY_RECEIVED_BUTTON/);

// 2–3. Confirm → awaiting_sitter_rating, actions disappear
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "confirm",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_confirmation"
  }),
  { ok: true, nextStatus: "awaiting_sitter_rating", noop: false }
);
assert.match(confirmRoute, /action: "confirm"/);
assert.match(actionServer, /confirm_manual_payment_received/);
assert.match(dashboard, /showManualRate/);
assert.match(dashboard, /handleSitterManualPaymentAction\("confirm"\)/);

// 4. Mandatory rating appears after confirm
assert.match(dashboard, /showManualRate && completedSummaryRow/);
assert.match(dashboard, /SitterMandatoryRatingPanel/);
assert.match(dashboard, /SITTER_AWAITING_RATING_LABEL/);
assert.equal(SITTER_AWAITING_RATING_LABEL, "ממתין לדירוג");
assert.equal(resolveSitterManualPaymentStep("awaiting_sitter_rating"), "rate");

// 5. Sitter rates → paid
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "mark_paid",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_rating",
    hasSitterRating: true
  }),
  { ok: true, nextStatus: "paid", noop: false }
);
assert.match(ratingSubmit, /mark_manual_payment_paid_after_sitter_rating/);
assert.match(ratingSubmit, /sitterMayRateParent/);

// 6. Refresh after confirm before rating → rating UI from DB
assert.match(dashboard, /fetchSitterActionableManualPayment/);
assert.match(dashboard, /resolveSitterManualPaymentStep/);
assert.match(fetchHelper, /SITTER_MANUAL_ACTIONABLE_STATUSES/);

// 7. Refresh after paid → no confirm/rating prompt
assert.equal(resolveSitterManualPaymentStep("paid"), "paid");
assert.equal(isBookingPaymentPaid({ paymentStatus: "paid" }), true);
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "paid" }), "שולם");
assert.match(fetchHelper, /SITTER_MANUAL_ACTIONABLE_STATUSES/);
assert.doesNotMatch(fetchHelper, /payment_status", "paid"/);

// 8. Deny → payment_dispute
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "deny",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_confirmation"
  }),
  { ok: true, nextStatus: "payment_dispute", noop: false }
);
assert.match(denyRoute, /action: "deny"/);
assert.match(actionServer, /deny_manual_payment_received/);
assert.match(dashboard, /showManualDispute/);
assert.match(dashboard, /PAYMENT_DISPUTE_HEADING/);
assert.equal(PAYMENT_DISPUTE_HEADING, "בירור תשלום");
assert.doesNotMatch(dashboard, /הסדרתי את התשלום/);

// 9–10. Parent notifications
assert.equal(MANUAL_PAYMENT_CONFIRMED_NOTIFICATION.kind, "manual_payment_confirmed");
assert.equal(MANUAL_PAYMENT_CONFIRMED_NOTIFICATION.title, "קבלת התשלום אושרה");
assert.equal(MANUAL_PAYMENT_CONFIRMED_NOTIFICATION.body, "הנני אישרה שהתשלום התקבל.");
assert.equal(MANUAL_PAYMENT_DENIED_NOTIFICATION.kind, "manual_payment_denied");
assert.equal(MANUAL_PAYMENT_DENIED_NOTIFICATION.title, "התשלום לא אושר");
assert.equal(
  MANUAL_PAYMENT_DENIED_NOTIFICATION.body,
  "הנני דיווחה שהתשלום טרם התקבל. יש להסדיר את התשלום לפני הזמנה חדשה."
);
assert.equal(isCanonicalNotificationKind("manual_payment_confirmed"), true);
assert.equal(isCanonicalNotificationKind("manual_payment_denied"), true);
assert.equal(
  notificationHrefForKind("manual_payment_confirmed", "parent", { booking_id: "b1" }),
  "/parent/dashboard"
);
assert.equal(
  privacySafeBodyForKind("manual_payment_denied"),
  "הנני דיווחה שהתשלום טרם התקבל. יש להסדיר את התשלום לפני הזמנה חדשה."
);
assert.match(actionServer, /notifyParentManualPaymentConfirmed/);
assert.match(actionServer, /notifyParentManualPaymentDenied/);

// 11. Wrong sitter cannot confirm/deny
assert.match(actionServer, /\.eq\("sitter_id", sitterId\)/);
assert.match(actionServer, /אין הרשאה לעדכן תשלום עבור הזמנה זו/);
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "confirm",
    actor: "parent",
    paymentStatus: "awaiting_sitter_confirmation"
  }),
  { ok: false, reason: "sitter_only" }
);

// 12. HYP paid sitter-rating flow still works
assert.match(dashboard, /isSessionPaidAndReadyForRating/);
assert.match(dashboard, /התשלום התקבל בהצלחה/);
assert.match(hypFinalize, /payment_status: "paid"/);
assert.match(ratingSubmit, /status === "paid"/);
assert.doesNotMatch(hypFinalize, /confirm_manual_payment_received/);

// Security: no client writes to payment_status
assert.doesNotMatch(dashboard, /payment_status:\s*"awaiting_sitter_rating"|payment_status:\s*"payment_dispute"|payment_status:\s*"paid"/);
assert.match(dashboard, /\/api\/sitter\/confirm-manual-payment/);
assert.match(dashboard, /\/api\/sitter\/deny-manual-payment/);
assert.doesNotMatch(parentDash, /confirm_manual_payment_received|deny_manual_payment_received/);

// Duplicate / stale: RPC noop refreshes rather than fatal
assert.match(actionServer, /noop: true/);
assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "confirm",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_rating"
  }),
  { ok: true, nextStatus: "awaiting_sitter_rating", noop: true }
);

assert.equal(MANUAL_PAYMENT_METHOD_LABELS.cash, "מזומן");
assert.equal(MANUAL_PAYMENT_METHOD_LABELS.bit, "Bit");
assert.equal(MANUAL_PAYMENT_METHOD_LABELS.paybox, "PayBox");
assert.match(panel, /MANUAL_PAYMENT_METHOD_LABELS/);

console.log("test-manual-payment-sitter-ui: PASS");
