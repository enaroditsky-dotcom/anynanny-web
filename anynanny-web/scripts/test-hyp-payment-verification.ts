import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeShiftChargeFromTrustedInputs } from "../lib/billing/compute-shift-charge";
import { hypOrderFromBookingId } from "../lib/billing/hyp/create-transaction";
import { isHypCapturedChargeCCode, isHypSuccessCCode } from "../lib/billing/hyp/parse-return-params";
import {
  decideHypFinalizeAction,
  hypAmountsMatchMinorUnits,
  hypAmountToMinorUnits,
  hypCheckoutCorrelationMatches,
  hypSessionMoreData
} from "../lib/billing/hyp/payment-authority";
import {
  buildHypVerifyQuery,
  hasSufficientHypVerifyPayload,
  parseOrderedHypQuery,
  readHypVerifyFields,
  verifyHypTransaction
} from "../lib/billing/hyp/verify-transaction";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const bookingId = "11111111-1111-1111-1111-111111111111";
const sessionId = "22222222-2222-2222-2222-222222222222";
const order = hypOrderFromBookingId(bookingId);
const start = "2026-08-19T10:00:00.000Z";
const end90m = "2026-08-19T11:30:00.000Z";
const charge90 = computeShiftChargeFromTrustedInputs({
  startTime: start,
  endTime: end90m,
  hourlyRateNis: 80
});
assert.ok(charge90);
assert.equal(charge90.amountMinorUnits, 12000);

const validQuery =
  `Id=408941655&CCode=0&Amount=120&ACode=0505293&Order=${order}&Info=${bookingId}&MoreData=Session_${sessionId}&Fild3=&Sign=a84b11187377554427f267a9139ad4fd7daf7fb661dd668a9b954cf41cd25904`;

function queryWith(overrides: Record<string, string | null>): string {
  const params = parseOrderedHypQuery(validQuery);
  const next = params.map((param) => {
    if (Object.prototype.hasOwnProperty.call(overrides, param.key)) {
      const value = overrides[param.key];
      if (value == null) return null;
      return { key: param.key, encodedValue: encodeURIComponent(value) };
    }
    return param;
  }).filter((param): param is { key: string; encodedValue: string } => param != null);
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) continue;
    if (!params.some((param) => param.key === key)) {
      next.push({ key, encodedValue: encodeURIComponent(value) });
    }
  }
  return next.map((param) => `${param.key}=${param.encodedValue}`).join("&");
}

const creds = { masof: "0010345518", key: "test-key", passP: "test-pass" };

// Success rule
assert.equal(isHypCapturedChargeCCode("0"), true);
assert.equal(isHypCapturedChargeCCode(" 0 "), true);
assert.equal(isHypCapturedChargeCCode(null), false);
assert.equal(isHypCapturedChargeCCode(""), false);
assert.equal(isHypCapturedChargeCCode("00"), false);
assert.equal(isHypCapturedChargeCCode("600"), false);
assert.equal(isHypCapturedChargeCCode("700"), false);
assert.equal(isHypCapturedChargeCCode("800"), false);
assert.equal(isHypCapturedChargeCCode("997"), false);
assert.equal(isHypSuccessCCode("0"), true);
assert.equal(isHypSuccessCCode(""), false);

// TEST 2 missing CCode
assert.equal(hasSufficientHypVerifyPayload(queryWith({ CCode: null })), false);
assert.equal(isHypCapturedChargeCCode(readHypVerifyFields(parseOrderedHypQuery(queryWith({ CCode: null }))).cCode), false);

// TEST 3-6 non-capture codes
for (const code of ["600", "700", "800", "997"]) {
  const q = queryWith({ CCode: code });
  assert.equal(isHypCapturedChargeCCode(readHypVerifyFields(parseOrderedHypQuery(q)).cCode), false);
}

// Official VERIFY prefix + original order
const ordered = parseOrderedHypQuery(validQuery);
assert.deepEqual(
  ordered.map((p) => p.key),
  ["Id", "CCode", "Amount", "ACode", "Order", "Info", "MoreData", "Fild3", "Sign"]
);
const verifyQuery = buildHypVerifyQuery(creds, ordered);
assert.match(verifyQuery, /^action=APISign&What=VERIFY&Masof=0010345518&KEY=test-key&PassP=test-pass&/);
assert.match(verifyQuery, /Id=408941655&CCode=0&Amount=120/);
assert.match(verifyQuery, /Sign=a84b11187377554427f267a9139ad4fd7daf7fb661dd668a9b954cf41cd25904/);
assert.ok(verifyQuery.indexOf("action=APISign") < verifyQuery.indexOf("Id=408941655"));
assert.ok(!verifyQuery.includes("KEY=test-key&PassP=test-pass&action"));

const fields = readHypVerifyFields(ordered);
assert.equal(hypAmountsMatchMinorUnits(fields.amount, charge90.amountMinorUnits), true);
assert.equal(
  hypCheckoutCorrelationMatches({
    bookingId,
    sessionId,
    fields
  }),
  true
);

async function main() {
// TEST 1 valid VERIFY mock
const verified = await verifyHypTransaction(validQuery, {
  credentials: {
    masof: creds.masof,
    key: creds.key,
    passP: creds.passP,
    user: "u",
    payBaseUrl: "https://pay.hyp.co.il/p/"
  },
  fetchImpl: async () =>
    new Response("CCode=0", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    })
});
assert.equal(verified.ok, true);
if (verified.ok) {
  assert.equal(verified.fields.cCode, "0");
  assert.equal(verified.fields.transId, "408941655");
  assert.equal(hypAmountsMatchMinorUnits(verified.fields.amount, 12000), true);
}

const payDecision = decideHypFinalizeAction({
  bookingPaid: false,
  bookingHypTransId: null,
  incomingHypTransId: "408941655",
  otherBookingIdWithSameTransId: null,
  expectedMinorUnits: 12000,
  incomingMinorUnits: 12000
});
assert.deepEqual(payDecision, { action: "pay" });

// TEST 7 tampered amount
assert.equal(hypAmountsMatchMinorUnits("0.01", 12000), false);
assert.equal(
  decideHypFinalizeAction({
    bookingPaid: false,
    bookingHypTransId: null,
    incomingHypTransId: "408941655",
    otherBookingIdWithSameTransId: null,
    expectedMinorUnits: 12000,
    incomingMinorUnits: hypAmountToMinorUnits("0.01") ?? -1
  }).action,
  "reject"
);

const verifyTamperedAmount = await verifyHypTransaction(queryWith({ Amount: "0.01" }), {
  credentials: {
    masof: creds.masof,
    key: creds.key,
    passP: creds.passP,
    user: "u",
    payBaseUrl: "https://pay.hyp.co.il/p/"
  },
  fetchImpl: async () => new Response("CCode=0", { status: 200 })
});
assert.equal(verifyTamperedAmount.ok, true);
if (verifyTamperedAmount.ok) {
  assert.equal(
    hypAmountsMatchMinorUnits(verifyTamperedAmount.fields.amount, 12000),
    false
  );
}

// TEST 8 tampered transaction id rejected when missing
const missingId = queryWith({ Id: null });
assert.equal(hasSufficientHypVerifyPayload(missingId), false);

const verifyMissingId = await verifyHypTransaction(validQuery, {
  credentials: {
    masof: creds.masof,
    key: creds.key,
    passP: creds.passP,
    user: "u",
    payBaseUrl: "https://pay.hyp.co.il/p/"
  },
  fetchImpl: async () => new Response("CCode=200", { status: 200 })
});
assert.equal(verifyMissingId.ok, false);

// TEST 9 wrong booking correlation
assert.equal(
  hypCheckoutCorrelationMatches({
    bookingId,
    sessionId,
    fields: { ...fields, info: "33333333-3333-3333-3333-333333333333", order: "not-this-booking" }
  }),
  false
);

// TEST 10 same trans twice → one pay, one noop
const first = decideHypFinalizeAction({
  bookingPaid: false,
  bookingHypTransId: null,
  incomingHypTransId: "408941655",
  otherBookingIdWithSameTransId: null,
  expectedMinorUnits: 12000,
  incomingMinorUnits: 12000
});
const second = decideHypFinalizeAction({
  bookingPaid: true,
  bookingHypTransId: "408941655",
  incomingHypTransId: "408941655",
  otherBookingIdWithSameTransId: null,
  expectedMinorUnits: 12000,
  incomingMinorUnits: 12000
});
assert.equal(first.action, "pay");
assert.equal(second.action, "noop");

// TEST 11 same trans on another booking
assert.equal(
  decideHypFinalizeAction({
    bookingPaid: false,
    bookingHypTransId: null,
    incomingHypTransId: "408941655",
    otherBookingIdWithSameTransId: "33333333-3333-3333-3333-333333333333",
    expectedMinorUnits: 12000,
    incomingMinorUnits: 12000
  }).action,
  "reject"
);

// TEST 12 already paid different transaction
assert.deepEqual(
  decideHypFinalizeAction({
    bookingPaid: true,
    bookingHypTransId: "111",
    incomingHypTransId: "408941655",
    otherBookingIdWithSameTransId: null,
    expectedMinorUnits: 12000,
    incomingMinorUnits: 12000
  }),
  { action: "reject", reason: "already_paid_different_transaction" }
);

// TEST 13-15 saved card
const tokenSrc = read("lib/billing/hyp/token.ts");
assert.match(tokenSrc, /isHypCapturedChargeCCode\(cCode\)/);
assert.doesNotMatch(tokenSrc, /cCode == null \|\| cCode === ""/);
const checkoutSrc = read("lib/billing/parent-checkout-handler.ts");
assert.match(checkoutSrc, /verifiedMinor !== charge\.amountMinorUnits/);
assert.match(checkoutSrc, /hypTransId: softTransId/);
assert.doesNotMatch(checkoutSrc, /hypApprovalId:/);

// Missing CCode / amount mismatch cannot be paid through token helper
assert.equal(isHypCapturedChargeCCode(null), false);
assert.equal(hypAmountsMatchMinorUnits("1", 12000), false);

// TEST 16 IPN without VERIFY fields
assert.equal(hasSufficientHypVerifyPayload("Id=1&CCode=0&Amount=120"), false);
assert.equal(hasSufficientHypVerifyPayload("CCode=0&Amount=120&Sign=abc"), false);
const webhookSrc = read("lib/billing/hyp-payment-webhook.ts");
assert.match(webhookSrc, /IGNORED_UNVERIFIABLE/);
assert.match(webhookSrc, /hasSufficientHypVerifyPayload/);
assert.match(webhookSrc, /completeVerifiedHypPayment/);
assert.doesNotMatch(webhookSrc, /finalizeHypPaymentSuccess\(supabase, \{\s*bookingId,/);

// TEST 17 Cardcom UUID does not mark paid
const cardcomSrc = read("lib/cardcom/handle-payment-webhook.ts");
assert.doesNotMatch(cardcomSrc, /payment_status:\s*"paid"/);
assert.doesNotMatch(cardcomSrc, /markBookingPaid/);
assert.match(cardcomSrc, /does not mark bookings paid/);

// TEST 18 only this session
const finalizeSrc = read("lib/billing/finalize-hyp-payment.ts");
assert.doesNotMatch(finalizeSrc, /eq\("status", "payment_pending"\)/);
assert.doesNotMatch(finalizeSrc, /\.limit\(5\)/);
assert.match(finalizeSrc, /finalize_verified_hyp_payment/);
assert.match(finalizeSrc, /noop/);

const completeSrc = read("app/api/hyp/complete/route.ts");
assert.match(completeSrc, /completeVerifiedHypPayment/);
assert.match(completeSrc, /hypQuery/);
assert.doesNotMatch(completeSrc, /amountPaid/);
assert.doesNotMatch(completeSrc, /isHypSuccessCCode/);

const completeHelper = read("lib/billing/complete-verified-hyp-payment.ts");
assert.match(completeHelper, /verifyHypTransaction/);
assert.match(completeHelper, /computeAuthoritativeShiftCharge/);
assert.match(completeHelper, /hypCheckoutCorrelationMatches/);

const migration = read(
  "supabase/migrations/20260820010000_hyp_payment_verification_idempotency.sql"
);
assert.match(migration, /add column if not exists hyp_trans_id text/);
assert.match(migration, /add column if not exists charged_amount_nis numeric\(12, 2\)/);
assert.match(migration, /create unique index if not exists bookings_hyp_trans_id_uidx/);
assert.match(migration, /where hyp_trans_id is not null/);
assert.match(migration, /create or replace function public\.finalize_verified_hyp_payment/);
assert.doesNotMatch(migration, /drop column if exists/);

const clientSrc = read("lib/billing/hyp/finalize-client.ts");
assert.match(clientSrc, /hypQuery:/);
assert.doesNotMatch(clientSrc, /amountPaid:/);
assert.doesNotMatch(clientSrc, /CCode:\s*\n\s*cCode/);

assert.equal(hypSessionMoreData(sessionId), `Session_${sessionId}`);
assert.equal(hypOrderFromBookingId(bookingId), bookingId.replace(/-/g, ""));

console.log("hyp payment verification ok");
}

void main();
