import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOOKING_PAYMENT_STATUS_LABELS,
  BOOKING_SHIFT_ENDED_LABEL,
  PARENT_COMPLETED_SHIFT_PAYMENT_ACTION,
  PARENT_PAYMENT_BOOKING_QUERY_PARAM,
  bookingPaymentStatusLabel,
  isBookingPaymentPaid,
  parentCompletedShiftPaymentActionLabel,
  parentPaymentRecoveryHref,
  parsePaymentBookingIdParam,
  resolveBookingPaymentDisplayKind
} from "../lib/bookings/payment-status-label";
import { STUCK_SHIFT_REVIEW_LABEL } from "../lib/bookings/stuck-shift-review";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const helper = read("lib/bookings/payment-status-label.ts");
const sitterHistory = read("app/sitter/shifts/page.tsx");
const parentHistory = read("app/parent/history/page.tsx");
const parentCalendar = read("app/parent/calendar/page.tsx");
const calendarViews = read("components/bookings/booking-calendar-views.tsx");
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const checkoutHandler = read("lib/billing/parent-checkout-handler.ts");
const finalizeHyp = read("lib/billing/finalize-hyp-payment.ts");
const hypCheckout = read("app/api/hyp/checkout/route.ts");

assert.equal(STUCK_SHIFT_REVIEW_LABEL, "ממתינה לבדיקה");

assert.equal(resolveBookingPaymentDisplayKind({ paymentStatus: "unpaid" }), "unpaid");
assert.equal(resolveBookingPaymentDisplayKind({ paymentStatus: "pending_checkout" }), "pending_checkout");
assert.equal(resolveBookingPaymentDisplayKind({ paymentStatus: "paid" }), "paid");
assert.equal(
  resolveBookingPaymentDisplayKind({ paymentStatus: "unpaid", paidAt: "2026-08-25T00:00:00Z" }),
  "paid"
);
assert.equal(resolveBookingPaymentDisplayKind({ paymentStatus: "completed" }), "unpaid");
assert.equal(
  resolveBookingPaymentDisplayKind({ paymentStatus: "awaiting_sitter_confirmation" }),
  "awaiting_sitter_confirmation"
);
assert.equal(
  resolveBookingPaymentDisplayKind({
    paymentStatus: "awaiting_sitter_confirmation",
    paidAt: "2026-08-25T00:00:00Z"
  }),
  "awaiting_sitter_confirmation"
);
assert.equal(resolveBookingPaymentDisplayKind({ paymentStatus: "payment_dispute" }), "payment_dispute");
assert.equal(
  resolveBookingPaymentDisplayKind({ paymentStatus: "awaiting_sitter_rating" }),
  "awaiting_sitter_rating"
);
assert.equal(isBookingPaymentPaid({ paymentStatus: "pending_checkout" }), false);
assert.equal(isBookingPaymentPaid({ paymentStatus: "paid" }), true);
assert.equal(isBookingPaymentPaid({ paidAt: " " }), false);
assert.equal(isBookingPaymentPaid({ paymentStatus: "awaiting_sitter_confirmation" }), false);
assert.equal(
  isBookingPaymentPaid({
    paymentStatus: "awaiting_sitter_confirmation",
    paidAt: "2026-08-25T00:00:00Z"
  }),
  false
);
assert.equal(isBookingPaymentPaid({ paymentStatus: "payment_dispute" }), false);
assert.equal(isBookingPaymentPaid({ paymentStatus: "awaiting_sitter_rating" }), false);

assert.equal(bookingPaymentStatusLabel({ paymentStatus: "unpaid" }), "ממתינה לתשלום");
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "pending_checkout" }), "התשלום לא הושלם");
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "paid" }), "שולם");
assert.equal(
  bookingPaymentStatusLabel({ paymentStatus: "awaiting_sitter_confirmation" }),
  "ממתין לאישור הנני"
);
assert.equal(bookingPaymentStatusLabel({ paymentStatus: "payment_dispute" }), "בירור תשלום");
assert.equal(
  bookingPaymentStatusLabel({ paymentStatus: "awaiting_sitter_rating" }),
  "ממתין לדירוג מבייביסיטר"
);
assert.equal(BOOKING_SHIFT_ENDED_LABEL, "הסתיימה");
assert.equal(PARENT_COMPLETED_SHIFT_PAYMENT_ACTION.unpaid, "שלם עכשיו");
assert.equal(PARENT_COMPLETED_SHIFT_PAYMENT_ACTION.pending_checkout, "נסה לשלם שוב");
assert.equal(parentCompletedShiftPaymentActionLabel({ paymentStatus: "paid" }), null);
assert.equal(parentCompletedShiftPaymentActionLabel({ paymentStatus: "unpaid" }), "שלם עכשיו");
assert.equal(
  parentCompletedShiftPaymentActionLabel({ paymentStatus: "awaiting_sitter_confirmation" }),
  null
);
assert.equal(parentCompletedShiftPaymentActionLabel({ paymentStatus: "payment_dispute" }), null);
assert.equal(
  parentCompletedShiftPaymentActionLabel({ paymentStatus: "awaiting_sitter_rating" }),
  null
);

const bookingId = "550e8400-e29b-41d4-a716-446655440000";
assert.equal(parsePaymentBookingIdParam(bookingId), bookingId);
assert.equal(parsePaymentBookingIdParam("../other"), null);
assert.equal(parsePaymentBookingIdParam(""), null);
assert.equal(
  parentPaymentRecoveryHref(bookingId),
  `/parent/dashboard?${PARENT_PAYMENT_BOOKING_QUERY_PARAM}=${bookingId}`
);

assert.match(helper, /Never infers paid from shift completion/);
assert.doesNotMatch(helper, /status === ["']completed["']/);

assert.match(sitterHistory, /BOOKING_SHIFT_ENDED_LABEL/);
assert.match(sitterHistory, /bookingPaymentStatusLabel/);
assert.match(sitterHistory, /STUCK_SHIFT_REVIEW_LABEL/);
assert.match(sitterHistory, /isSitterPastHistoryBooking/);
assert.doesNotMatch(sitterHistory, /שלם עכשיו/);
assert.doesNotMatch(sitterHistory, /parentPaymentRecoveryHref/);
assert.doesNotMatch(sitterHistory, /label: "בוצעה"/);

assert.match(parentHistory, /if \(requiresAdminReview === true\) return STUCK_SHIFT_REVIEW_LABEL/);
assert.doesNotMatch(parentHistory, /if \(status === "completed"\) return "שולם"/);
assert.match(parentHistory, /parentPaymentRecoveryHref\(shift\.id\)/);
assert.match(parentHistory, /parentCompletedShiftPaymentActionLabel/);

assert.match(calendarViews, /הושלם/);
assert.match(calendarViews, /bookingPaymentStatusLabel/);
assert.doesNotMatch(calendarViews, /\/api\/checkout/);
assert.match(parentCalendar, /coerceBookingPaymentStatus/);
assert.doesNotMatch(parentCalendar, /\/api\/checkout/);

assert.match(dashboard, /PARENT_PAYMENT_BOOKING_QUERY_PARAM/);
assert.match(dashboard, /fetchOwnedParentBookingById/);
assert.match(dashboard, /\.eq\("id", id\)/);
assert.match(dashboard, /\.eq\("parent_id", uid\)/);
assert.match(dashboard, /paymentRecoveryBooking/);
assert.match(dashboard, /isBookingPaymentPaid/);
assert.match(dashboard, /normalizeStatus\(owned\.status\) !== "completed"/);

assert.match(checkoutHandler, /This booking is already paid/);
assert.match(checkoutHandler, /payment_status === "paid" \|\| row\.paid_at/);
assert.match(hypCheckout, /payment_status: "pending_checkout"/);
assert.match(finalizeHyp, /payment_status: "paid"/);

assert.match(sitterHistory, /STUCK_SHIFT_REVIEW_LABEL/);
assert.match(parentHistory, /STUCK_SHIFT_REVIEW_LABEL/);
assert.match(dashboard, /STUCK_SHIFT_REVIEW_LABEL/);

console.log("test-payment-status-recovery: PASS");
