import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOOKING_PAYMENT_STATUSES,
  MANUAL_PAYMENT_METHODS,
  PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE,
  SITTER_RATE_BEFORE_CONFIRMATION_MESSAGE,
  clientMayWritePaymentStatus,
  evaluateManualPaymentTransition,
  isManualPaymentMethod,
  parentHasUnresolvedPaymentDispute,
  parseManualPaymentMethod,
  sitterMayRateParent,
  sitterMustNotRateParent,
  type ManualPaymentAction,
  type PaymentActorRole
} from "../lib/billing/manual-payment-lifecycle";
import { coerceBookingPaymentStatus, isBookingPaymentPaid } from "../lib/bookings/payment-status-label";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260901120000_manual_payment_lifecycle.sql";
const sql = read(MIGRATION);
const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");

const ACTIONS: ManualPaymentAction[] = ["report", "confirm", "deny", "mark_paid"];
const ACTORS: PaymentActorRole[] = ["parent", "sitter", "other"];
const FROM_STATUSES = [
  "unpaid",
  "pending_checkout",
  "awaiting_sitter_confirmation",
  "payment_dispute",
  "awaiting_sitter_rating",
  "paid"
] as const;

// ---------------------------------------------------------------------------
// A. State-machine unit tests — every action × actor × from-status
// ---------------------------------------------------------------------------
assert.deepEqual([...MANUAL_PAYMENT_METHODS], ["cash", "bit", "paybox"]);
assert.ok(isManualPaymentMethod("cash"));
assert.ok(isManualPaymentMethod("Bit"));
assert.equal(parseManualPaymentMethod("paybox"), "paybox");
assert.equal(parseManualPaymentMethod("credit_card"), null);
assert.equal(parseManualPaymentMethod("apple_pay"), null);

assert.equal(sitterMayRateParent("awaiting_sitter_rating"), true);
assert.equal(sitterMayRateParent("paid"), true);
for (const blocked of [
  "unpaid",
  "pending_checkout",
  "awaiting_sitter_confirmation",
  "payment_dispute"
] as const) {
  assert.equal(sitterMayRateParent(blocked), false);
  assert.equal(sitterMustNotRateParent(blocked), true);
}

assert.equal(parentHasUnresolvedPaymentDispute(["unpaid", "paid"]), false);
assert.equal(parentHasUnresolvedPaymentDispute(["awaiting_sitter_confirmation"]), false);
assert.equal(parentHasUnresolvedPaymentDispute(["paid", "payment_dispute"]), true);
assert.equal(
  PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE,
  "קיים תשלום שטרם אושר. יש להסדיר אותו לפני הזמנה חדשה."
);

for (const action of ACTIONS) {
  for (const actor of ACTORS) {
    for (const from of FROM_STATUSES) {
      const result = evaluateManualPaymentTransition({
        action,
        actor,
        paymentStatus: from,
        paymentMethod: "cash",
        hasParentRating: true,
        hasSitterRating: true,
        bookingStatus: "completed"
      });

      if (action === "report") {
        if (actor !== "parent") {
          assert.equal(result.ok, false, `${action} ${actor} ${from}`);
          if (!result.ok) assert.equal(result.reason, "parent_only");
          continue;
        }
        if (from === "awaiting_sitter_confirmation") {
          assert.deepEqual(result, {
            ok: true,
            nextStatus: "awaiting_sitter_confirmation",
            noop: true
          });
          continue;
        }
        if (from === "unpaid" || from === "payment_dispute") {
          assert.deepEqual(result, {
            ok: true,
            nextStatus: "awaiting_sitter_confirmation",
            noop: false
          });
          continue;
        }
        assert.equal(result.ok, false, `${action} ${actor} ${from}`);
        if (!result.ok) assert.equal(result.reason, "invalid_from_status");
        continue;
      }

      if (action === "confirm") {
        if (actor !== "sitter") {
          assert.equal(result.ok, false, `${action} ${actor} ${from}`);
          if (!result.ok) assert.equal(result.reason, "sitter_only");
          continue;
        }
        if (from === "awaiting_sitter_rating") {
          assert.deepEqual(result, {
            ok: true,
            nextStatus: "awaiting_sitter_rating",
            noop: true
          });
          continue;
        }
        if (from === "awaiting_sitter_confirmation") {
          assert.deepEqual(result, {
            ok: true,
            nextStatus: "awaiting_sitter_rating",
            noop: false
          });
          continue;
        }
        assert.equal(result.ok, false, `${action} ${actor} ${from}`);
        if (!result.ok) assert.equal(result.reason, "invalid_from_status");
        continue;
      }

      if (action === "deny") {
        if (actor !== "sitter") {
          assert.equal(result.ok, false, `${action} ${actor} ${from}`);
          if (!result.ok) assert.equal(result.reason, "sitter_only");
          continue;
        }
        if (from === "payment_dispute") {
          assert.deepEqual(result, { ok: true, nextStatus: "payment_dispute", noop: true });
          continue;
        }
        if (from === "awaiting_sitter_confirmation") {
          assert.deepEqual(result, { ok: true, nextStatus: "payment_dispute", noop: false });
          continue;
        }
        assert.equal(result.ok, false, `${action} ${actor} ${from}`);
        if (!result.ok) assert.equal(result.reason, "invalid_from_status");
        continue;
      }

      if (actor !== "sitter") {
        assert.equal(result.ok, false, `${action} ${actor} ${from}`);
        if (!result.ok) assert.equal(result.reason, "sitter_only");
        continue;
      }
      if (from === "paid") {
        assert.deepEqual(result, { ok: true, nextStatus: "paid", noop: true });
        continue;
      }
      if (from === "awaiting_sitter_rating") {
        assert.deepEqual(result, { ok: true, nextStatus: "paid", noop: false });
        continue;
      }
      assert.equal(result.ok, false, `${action} ${actor} ${from}`);
      if (!result.ok) assert.equal(result.reason, "invalid_from_status");
    }
  }
}

assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "report",
    actor: "parent",
    paymentStatus: "unpaid",
    paymentMethod: "credit_card",
    hasParentRating: true,
    bookingStatus: "completed"
  }),
  { ok: false, reason: "invalid_method" }
);

assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "report",
    actor: "parent",
    paymentStatus: "unpaid",
    paymentMethod: "cash",
    hasParentRating: false,
    bookingStatus: "completed"
  }),
  { ok: false, reason: "parent_rating_required" }
);

assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "report",
    actor: "parent",
    paymentStatus: "unpaid",
    paymentMethod: "bit",
    hasParentRating: true,
    bookingStatus: "approved"
  }),
  { ok: false, reason: "shift_not_completed" }
);

assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "mark_paid",
    actor: "sitter",
    paymentStatus: "awaiting_sitter_rating",
    hasSitterRating: false
  }),
  { ok: false, reason: "sitter_rating_required" }
);

assert.equal(clientMayWritePaymentStatus("authenticated", "unpaid", "pending_checkout"), true);
assert.equal(clientMayWritePaymentStatus("authenticated", "unpaid", "paid"), false);
assert.equal(clientMayWritePaymentStatus("authenticated", "unpaid", "awaiting_sitter_confirmation"), false);
assert.equal(clientMayWritePaymentStatus("authenticated", "pending_checkout", "paid"), false);
assert.equal(clientMayWritePaymentStatus("authenticated", "awaiting_sitter_rating", "paid"), false);
assert.equal(clientMayWritePaymentStatus("authenticated", "payment_dispute", "paid"), false);
assert.equal(clientMayWritePaymentStatus("anon", "unpaid", "paid"), false);
assert.equal(clientMayWritePaymentStatus("postgres", "unpaid", "paid"), true);

for (const status of BOOKING_PAYMENT_STATUSES) {
  assert.equal(coerceBookingPaymentStatus(status), status);
  if (status !== "paid") {
    assert.equal(isBookingPaymentPaid({ paymentStatus: status }), false);
  }
}
assert.equal(isBookingPaymentPaid({ paymentStatus: "paid" }), true);
assert.equal(isBookingPaymentPaid({ paymentStatus: "awaiting_sitter_rating" }), false);
assert.equal(isBookingPaymentPaid({ paymentStatus: "payment_dispute" }), false);

// ---------------------------------------------------------------------------
// B. Migration contract
// ---------------------------------------------------------------------------
assert.match(sql, /add column if not exists payment_method text/);
assert.match(sql, /add column if not exists payment_rail text/);
assert.match(sql, /add column if not exists parent_reported_paid_at timestamptz/);
assert.match(sql, /add column if not exists sitter_confirmed_received_at timestamptz/);
assert.match(sql, /add column if not exists payment_dispute_at timestamptz/);
assert.match(sql, /add column if not exists parent_resolved_reported_at timestamptz/);
assert.doesNotMatch(sqlWithoutComments, /update public\.bookings\s+set payment_status = 'paid'\s+where/i);
assert.doesNotMatch(sql, /set payment_status = 'unpaid'/);

assert.match(sql, /drop constraint if exists bookings_payment_status_check/);
assert.match(sql, /'unpaid'/);
assert.match(sql, /'pending_checkout'/);
assert.match(sql, /'paid'/);
assert.match(sql, /'awaiting_sitter_confirmation'/);
assert.match(sql, /'payment_dispute'/);
assert.match(sql, /'awaiting_sitter_rating'/);

assert.match(sql, /create or replace function public\.parent_has_unresolved_payment_dispute\(p_parent_id uuid\)/);
assert.match(sql, /b\.payment_status = 'payment_dispute'/);
assert.doesNotMatch(sqlWithoutComments, /suspended_at\s*=/);
assert.doesNotMatch(sqlWithoutComments, /profiles\.suspended_at/);

assert.match(sql, /create or replace function public\.report_manual_payment\(/);
assert.match(sql, /create or replace function public\.confirm_manual_payment_received\(/);
assert.match(sql, /create or replace function public\.deny_manual_payment_received\(/);
assert.match(sql, /create or replace function public\.mark_manual_payment_paid_after_sitter_rating\(/);

const reportFn = sql.slice(sql.indexOf("create or replace function public.report_manual_payment"));
const confirmFn = sql.slice(sql.indexOf("create or replace function public.confirm_manual_payment_received"));
const denyFn = sql.slice(sql.indexOf("create or replace function public.deny_manual_payment_received"));
const markPaidFn = sql.slice(
  sql.indexOf("create or replace function public.mark_manual_payment_paid_after_sitter_rating")
);

assert.match(reportFn, /v_booking\.parent_id is distinct from auth\.uid\(\)/);
assert.match(reportFn, /v_method not in \('cash', 'bit', 'paybox'\)/);
assert.match(reportFn, /v_status is distinct from 'unpaid' and v_status is distinct from 'payment_dispute'/);
assert.match(reportFn, /payment_status = 'awaiting_sitter_confirmation'/);
assert.match(reportFn, /payment_rail = 'manual'/);
assert.match(reportFn, /parent_reported_paid_at = v_now/);
assert.match(reportFn, /parent_resolved_reported_at/);
assert.match(reportFn, /manual_payment_booking_has_parent_rating/);
assert.match(reportFn, /shift is not completed|status.*completed/);
assert.doesNotMatch(reportFn.slice(0, 2500), /payment_status = 'paid'/);

assert.match(confirmFn, /v_booking\.sitter_id is distinct from auth\.uid\(\)/);
assert.match(confirmFn, /v_status is distinct from 'awaiting_sitter_confirmation'/);
assert.match(confirmFn, /payment_status = 'awaiting_sitter_rating'/);
assert.doesNotMatch(confirmFn.slice(0, 2200), /payment_status = 'paid'/);

assert.match(denyFn, /v_booking\.sitter_id is distinct from auth\.uid\(\)/);
assert.match(denyFn, /v_status is distinct from 'awaiting_sitter_confirmation'/);
assert.match(denyFn, /payment_status = 'payment_dispute'/);
assert.doesNotMatch(denyFn.slice(0, 2200), /payment_status = 'paid'/);

assert.match(markPaidFn, /v_booking\.sitter_id is distinct from auth\.uid\(\)/);
assert.match(markPaidFn, /v_status is distinct from 'awaiting_sitter_rating'/);
assert.match(markPaidFn, /manual_payment_booking_has_sitter_rating/);
assert.match(markPaidFn, /payment_status = 'paid'/);
assert.match(markPaidFn, /paid_at = coalesce\(paid_at, v_now\)/);
assert.match(markPaidFn, /publish_parent_ratings_for_booking/);
assert.doesNotMatch(markPaidFn.slice(0, 2800), /credit_sitter_wallet/);
assert.doesNotMatch(markPaidFn.slice(0, 2800), /finalize_verified_hyp_payment/);

assert.match(sql, /grant execute on function public\.report_manual_payment\(uuid, text\) to authenticated/);
assert.match(sql, /grant execute on function public\.confirm_manual_payment_received\(uuid\) to authenticated/);
assert.match(sql, /grant execute on function public\.deny_manual_payment_received\(uuid\) to authenticated/);
assert.match(
  sql,
  /grant execute on function public\.mark_manual_payment_paid_after_sitter_rating\(uuid\) to authenticated/
);
assert.match(sql, /revoke all on function public\.report_manual_payment\(uuid, text\) from anon/);
assert.match(sql, /revoke all on function public\.confirm_manual_payment_received\(uuid\) from anon/);

assert.match(sql, /create or replace function public\.bookings_protect_payment_lifecycle_columns\(\)/);
assert.match(sql, /current_user is distinct from 'authenticated'/);
assert.match(sql, /payment status cannot be changed directly/);
assert.match(sql, /v_from = 'unpaid'/);
assert.match(sql, /v_to = 'pending_checkout'/);
assert.match(sql, /new\.paid_at is distinct from old\.paid_at/);
assert.match(sql, /new\.hyp_trans_id is distinct from old\.hyp_trans_id/);

assert.match(sql, /קיים תשלום שטרם אושר\. יש להסדיר אותו לפני הזמנה חדשה\./);
assert.match(sql, /bookings_block_new_obligation_during_payment_dispute/);
assert.match(sql, /not public\.parent_has_unresolved_payment_dispute\(auth\.uid\(\)\)/);
assert.match(sql, /not public\.parent_has_unresolved_payment_dispute\(parent_id\)/);

assert.match(sql, /sitter may rate only after payment confirmation/);
assert.match(sql, /b\.payment_status in \('awaiting_sitter_rating', 'paid'\)/);
assert.match(sql, /new\.published_at := null/);
assert.match(sql, /trg_ratings_mark_manual_payment_paid/);
assert.match(sql, /s\.status::text in \('completed', 'payment_pending', 'paid', 'sitter_completed'\)/);

assert.doesNotMatch(sqlWithoutComments, /create or replace function public\.finalize_verified_hyp_payment/);
assert.doesNotMatch(sqlWithoutComments, /drop function public\.finalize_verified_hyp_payment/);
assert.doesNotMatch(sql, /end_shift_atomic/);
assert.doesNotMatch(sql, /submit_missed_shift_reason/);
assert.doesNotMatch(sql, /request_booking_cancellation/);

const hypFinalize = read("supabase/migrations/20260820010000_hyp_payment_verification_idempotency.sql");
assert.match(hypFinalize, /create or replace function public\.finalize_verified_hyp_payment/);
assert.doesNotMatch(hypFinalize, /awaiting_sitter_confirmation|payment_dispute|report_manual_payment/);

const ratingsInsert = read("lib/ratings/submit-session-rating.ts");
assert.match(ratingsInsert, /sitterMayRateParent/);
assert.match(ratingsInsert, /SITTER_RATE_BEFORE_CONFIRMATION_MESSAGE/);
assert.match(ratingsInsert, /mark_manual_payment_paid_after_sitter_rating/);
assert.match(ratingsInsert, /published_at: isParent \? null/);
assert.doesNotMatch(ratingsInsert, /status !== "paid"/);

assert.equal(SITTER_RATE_BEFORE_CONFIRMATION_MESSAGE, "ניתן לדרג את המשפחה רק לאחר אישור קבלת התשלום.");

const createBooking = read("lib/bookings/create-booking.ts");
assert.match(createBooking, /parent_has_unresolved_payment_dispute/);
assert.match(createBooking, /PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE/);
assert.match(createBooking, /status: "pending"/);

const approveBooking = read("lib/bookings/sitter-pending-bookings.ts");
assert.match(approveBooking, /parent_has_unresolved_payment_dispute/);
assert.match(approveBooking, /PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE/);

const parentDashboard = read("components/parent/parent-dashboard-client.tsx");
assert.match(parentDashboard, /report-manual-payment|שילמתי/);
assert.match(parentDashboard, /ManualPaymentPanel/);
const paymentFactory = read("components/billing/PaymentFactory.tsx");
assert.doesNotMatch(paymentFactory, /report_manual_payment|מזומן/);

console.log("test-manual-payment-lifecycle: PASS");
