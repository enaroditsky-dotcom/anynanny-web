import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARENT_PLATFORM_FEE_MULTIPLIER,
  computeShiftChargeFromTrustedInputs,
  storedFinalsAreConsistent,
  resolveShiftChargeFromSessionFields
} from "../lib/billing/compute-shift-charge";
import { PARENT_PLATFORM_FEE_MULTIPLIER as PUBLISHED_MULTIPLIER } from "../lib/sitter/public-search-card";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const start = "2026-08-19T10:00:00.000Z";
const end90m = "2026-08-19T11:30:00.000Z";
const rate = 80;

// TEST 1 + TEST 12 — normal shift, pro-rata partial hour
const charge90 = computeShiftChargeFromTrustedInputs({
  startTime: start,
  endTime: end90m,
  hourlyRateNis: rate
});
assert.ok(charge90);
assert.equal(charge90.elapsedSeconds, 5400);
assert.equal(charge90.sitterBaseNis, 120);
assert.equal(charge90.parentTotalNis, 120);
assert.equal(charge90.amountMinorUnits, 12000);

const charge2m = computeShiftChargeFromTrustedInputs({
  startTime: start,
  endTime: "2026-08-19T10:02:00.000Z",
  hourlyRateNis: 50
});
assert.ok(charge2m);
assert.equal(charge2m.elapsedSeconds, 120);
assert.equal(charge2m.sitterBaseNis, Number(((120 / 3600) * 50).toFixed(2)));
assert.equal(charge2m.sitterBaseNis, 1.67);

const chargeSubSecondFloor = computeShiftChargeFromTrustedInputs({
  startTime: start,
  endTime: "2026-08-19T10:00:00.900Z",
  hourlyRateNis: 50
});
assert.ok(chargeSubSecondFloor);
assert.equal(chargeSubSecondFloor.elapsedSeconds, 0);
assert.equal(chargeSubSecondFloor.sitterBaseNis, 0);
assert.equal(chargeSubSecondFloor.amountMinorUnits, 50);

// TEST 13 — multiplier remains 1
assert.equal(PARENT_PLATFORM_FEE_MULTIPLIER, 1);
assert.equal(PUBLISHED_MULTIPLIER, 1);
assert.equal(charge90.platformFeeMultiplier, 1);
assert.equal(charge90.parentTotalNis, charge90.sitterBaseNis);

const storedOk = storedFinalsAreConsistent({
  startTime: start,
  endTime: end90m,
  hourlyRateNis: rate,
  finalElapsedSeconds: 5400,
  finalAmountNis: 120
});
assert.equal(storedOk, true);

const storedTamperedAmount = storedFinalsAreConsistent({
  startTime: start,
  endTime: end90m,
  hourlyRateNis: rate,
  finalElapsedSeconds: 5400,
  finalAmountNis: 1
});
assert.equal(storedTamperedAmount, false);

const recomputed = resolveShiftChargeFromSessionFields({
  startTime: start,
  endTime: end90m,
  hourlyRateNis: rate,
  finalElapsedSeconds: 999999,
  finalAmountNis: 1
});
assert.ok(recomputed);
assert.equal(recomputed.elapsedSeconds, 5400);
assert.equal(recomputed.sitterBaseNis, 120);

const migration = read(
  "supabase/migrations/20260819234500_end_shift_atomic_authoritative_amount.sql"
).replace(/\r\n/g, "\n");
const checkout = read("lib/billing/parent-checkout-handler.ts");
const hypCheckout = read("app/api/hyp/checkout/route.ts");
const confirm = read("lib/bookings/parent-confirm-end-booking.ts");
const billing = read("lib/billing/session-billing.ts");
const executor = read("lib/billing/use-payment-executor.ts");
const helper = read("lib/billing/compute-shift-charge.ts");

assert.match(migration, /create or replace function public\.end_shift_atomic\(\s*p_session_id uuid\s*\)/);
assert.doesNotMatch(migration, /drop function(?: public)?\.end_shift_atomic\(uuid, uuid/);

function plpgsqlBodyAfter(sql: string, marker: string): string {
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, `missing marker: ${marker}`);
  const asDollar = sql.indexOf("as $$", start);
  assert.ok(asDollar >= 0, `missing as $$ after ${marker}`);
  const end = sql.indexOf("$$;", asDollar + 5);
  assert.ok(end >= 0, `missing $$; after ${marker}`);
  return sql.slice(asDollar, end);
}

const oneArgBody = plpgsqlBodyAfter(
  migration,
  "create or replace function public.end_shift_atomic(\n  p_session_id uuid\n)"
);
const wrapperBody = plpgsqlBodyAfter(
  migration,
  "TEMPORARY BACKWARD-COMPATIBILITY OVERLOAD"
);

assert.match(oneArgBody, /v_parent uuid := auth\.uid\(\)/);
assert.match(oneArgBody, /v_end_ts := now\(\)/);
assert.match(oneArgBody, /v_start_ts := v_session\.start_time/);
assert.match(oneArgBody, /hourly_rate_nis/);
assert.match(oneArgBody, /round\(\(v_elapsed::numeric \/ 3600\.0\) \* v_rate, 2\)/);
assert.match(oneArgBody, /status\s+= 'payment_pending'/);
assert.doesNotMatch(oneArgBody, /payment_status\s*=\s*'paid'/);
assert.doesNotMatch(oneArgBody, /p_elapsed/);
assert.doesNotMatch(oneArgBody, /p_amount/);
assert.doesNotMatch(oneArgBody, /p_end_iso/);
assert.doesNotMatch(oneArgBody, /p_parent_id/);

// TEST 4 / 5 / 8 — identity from JWT; sitter is not session.parent_id
assert.match(oneArgBody, /if v_session\.parent_id is distinct from v_parent/);
assert.match(oneArgBody, /if v_booking\.parent_id is distinct from v_parent/);
assert.match(oneArgBody, /if v_parent is null/);

// TEST 6 — pending/approved cannot first-end
assert.match(oneArgBody, /v_booking_status not in \('parent_started', 'sitter_ended'\)/);
assert.match(oneArgBody, /v_session_status not in \('active', 'in_progress', 'sitter_completed'\)/);

// TEST 9 / D — idempotent replay keeps first end/amount through both signatures
assert.match(oneArgBody, /v_already_ended/);
assert.match(oneArgBody, /return v_session;/);
assert.match(oneArgBody, /actual_end_time = coalesce\(actual_end_time,/);

// TEST B — legacy 5-arg wrapper ignores malicious client values
assert.match(
  migration,
  /create or replace function public\.end_shift_atomic\(\s*p_session_id uuid,\s*p_parent_id uuid,\s*p_end_iso timestamptz,\s*p_elapsed integer,\s*p_amount numeric\s*\)/
);
assert.match(wrapperBody, /TEMPORARY BACKWARD-COMPATIBILITY OVERLOAD/);
assert.match(wrapperBody, /return public\.end_shift_atomic\(p_session_id\);/);
assert.doesNotMatch(wrapperBody, /:=\s*p_parent_id/);
assert.doesNotMatch(wrapperBody, /:=\s*p_end_iso/);
assert.doesNotMatch(wrapperBody, /:=\s*p_elapsed/);
assert.doesNotMatch(wrapperBody, /:=\s*p_amount/);
assert.doesNotMatch(wrapperBody, /auth\.uid\(\)\s*<>\s*p_parent_id/);
assert.doesNotMatch(wrapperBody, /final_amount_nis\s*=\s*p_amount/);
assert.doesNotMatch(wrapperBody, /final_elapsed_seconds\s*=\s*p_elapsed/);
assert.doesNotMatch(wrapperBody, /end_time\s*=\s*p_end_iso/);

assert.match(
  migration,
  /grant execute on function public\.end_shift_atomic\(uuid\) to authenticated/
);
assert.match(
  migration,
  /grant execute on function public\.end_shift_atomic\(uuid, uuid, timestamptz, integer, numeric\) to authenticated/
);
assert.match(migration, /revoke all on function public\.end_shift_atomic\(uuid\) from anon/);
assert.match(
  migration,
  /revoke all on function public\.end_shift_atomic\(uuid, uuid, timestamptz, integer, numeric\) from anon/
);

assert.match(confirm, /end_shift_atomic/);
assert.match(confirm, /p_session_id: sessionId/);
assert.doesNotMatch(confirm, /p_parent_id:/);
assert.doesNotMatch(confirm, /p_end_iso:/);
assert.doesNotMatch(confirm, /p_elapsed:/);
assert.doesNotMatch(confirm, /p_amount:/);
assert.doesNotMatch(confirm, /final_elapsed_seconds:/);
assert.doesNotMatch(confirm, /final_amount_nis:/);
assert.match(confirm, /status: "payment_pending"/);

assert.match(billing, /p_session_id: sessionId/);
assert.doesNotMatch(billing, /p_parent_id:/);
assert.doesNotMatch(billing, /p_elapsed:/);
assert.doesNotMatch(billing, /p_amount:/);
assert.doesNotMatch(billing, /p_end_iso:/);

// TEST 2 / 3 / 10 — checkout ignores browser amounts
assert.match(checkout, /computeAuthoritativeShiftCharge/);
assert.match(checkout, /Ignored\. Amount is derived server-side/);
assert.doesNotMatch(checkout, /resolveAmountMinorUnits/);
assert.doesNotMatch(checkout, /body\.amountMinorUnits/);
assert.doesNotMatch(checkout, /body\.totalPriceNis/);
assert.doesNotMatch(checkout, /elapsedSeconds/);
assert.match(checkout, /amountNis: charge\.amountMinorUnits \/ 100/);

// TEST 11 — saved-card uses the same authoritative amount
assert.match(checkout, /chargeHypSavedToken\(\{/);
assert.match(checkout, /amountNis: charge\.amountMinorUnits \/ 100/);

assert.match(hypCheckout, /computeAuthoritativeShiftCharge/);
assert.doesNotMatch(hypCheckout, /amountMinorUnits \/ 100\s*\n\s*\? amountMinorUnits/);
assert.doesNotMatch(hypCheckout, /: 50;/);
assert.match(hypCheckout, /amountNis: charge\.amountMinorUnits \/ 100/);

assert.match(helper, /PARENT_PLATFORM_FEE_MULTIPLIER/);
assert.match(helper, /Math\.max\(50, Math\.round\(parentTotalNis \* 100\)\)/);
assert.doesNotMatch(helper, /sitter_profiles/);

assert.doesNotMatch(executor, /amountMinorUnits,/);
assert.doesNotMatch(executor, /elapsedSeconds: params\.elapsedSeconds/);

// ---------------------------------------------------------------------------
// Contract simulation for A/B/C/D.
// Extra 5-arg fields are accepted and then discarded, matching the SQL wrapper.
// ---------------------------------------------------------------------------
type SimulatedEnd =
  | { ok: true; elapsedSeconds: number; amountNis: number; endTime: string }
  | { ok: false; error: "not authenticated" | "not authorized" };

function simulateEndShiftAtomic(input: {
  authUid: string | null;
  sessionParentId: string;
  bookingParentId: string;
  sessionStatus: string;
  bookingStatus: string;
  startTime: string;
  hourlyRateNis: number;
  nowIso: string;
  existingEndTime?: string | null;
  existingElapsed?: number | null;
  existingAmount?: number | null;
  p_parent_id?: string;
  p_end_iso?: string;
  p_elapsed?: number;
  p_amount?: number;
}): SimulatedEnd {
  // Legacy 5-arg parameters are intentionally unused (same as the SQL wrapper).
  void input.p_parent_id;
  void input.p_end_iso;
  void input.p_elapsed;
  void input.p_amount;

  if (input.authUid == null) return { ok: false, error: "not authenticated" };
  if (input.sessionParentId !== input.authUid) return { ok: false, error: "not authorized" };
  if (input.bookingParentId !== input.authUid) return { ok: false, error: "not authorized" };

  const alreadyEnded =
    input.sessionStatus === "payment_pending" &&
    input.existingEndTime != null &&
    input.existingElapsed != null &&
    input.existingAmount != null;
  if (alreadyEnded) {
    return {
      ok: true,
      elapsedSeconds: input.existingElapsed!,
      amountNis: input.existingAmount!,
      endTime: input.existingEndTime!
    };
  }

  const charge = computeShiftChargeFromTrustedInputs({
    startTime: input.startTime,
    endTime: input.nowIso,
    hourlyRateNis: input.hourlyRateNis
  });
  assert.ok(charge);
  return {
    ok: true,
    elapsedSeconds: charge.elapsedSeconds,
    amountNis: charge.sitterBaseNis,
    endTime: input.nowIso
  };
}

const parentId = "11111111-1111-1111-1111-111111111111";
const fakeParentId = "22222222-2222-2222-2222-222222222222";
const baseEnd = {
  authUid: parentId,
  sessionParentId: parentId,
  bookingParentId: parentId,
  sessionStatus: "active",
  bookingStatus: "parent_started",
  startTime: start,
  hourlyRateNis: rate,
  nowIso: end90m
};

// TEST A — 1-arg RPC computes authoritative amount from start/now/rate.
const oneArg = simulateEndShiftAtomic(baseEnd);
assert.equal(oneArg.ok, true);
if (oneArg.ok) {
  assert.equal(oneArg.elapsedSeconds, 5400);
  assert.equal(oneArg.amountNis, 120);
  assert.equal(oneArg.endTime, end90m);
}

// TEST B — legacy 5-arg with malicious client values matches 1-arg exactly.
const fiveArgMalicious = simulateEndShiftAtomic({
  ...baseEnd,
  p_parent_id: fakeParentId,
  p_end_iso: "2099-01-01T00:00:00.000Z",
  p_elapsed: 1,
  p_amount: 0.01
});
assert.deepEqual(fiveArgMalicious, oneArg);
assert.notEqual(0.01, oneArg.ok ? oneArg.amountNis : null);
assert.notEqual(1, oneArg.ok ? oneArg.elapsedSeconds : null);

// TEST C — unauthorized user cannot exploit either signature (even with a fake parent id).
const unauthOneArg = simulateEndShiftAtomic({
  ...baseEnd,
  authUid: fakeParentId
});
const unauthFiveArg = simulateEndShiftAtomic({
  ...baseEnd,
  authUid: fakeParentId,
  p_parent_id: parentId,
  p_end_iso: "2099-01-01T00:00:00.000Z",
  p_elapsed: 1,
  p_amount: 0.01
});
assert.deepEqual(unauthOneArg, { ok: false, error: "not authorized" });
assert.deepEqual(unauthFiveArg, unauthOneArg);
assert.deepEqual(
  simulateEndShiftAtomic({ ...baseEnd, authUid: null, p_parent_id: parentId, p_amount: 0.01 }),
  { ok: false, error: "not authenticated" }
);

// TEST D — replay stays idempotent through both signatures.
const replayBase = {
  ...baseEnd,
  sessionStatus: "payment_pending",
  nowIso: "2099-01-01T00:00:00.000Z",
  existingEndTime: end90m,
  existingElapsed: 5400,
  existingAmount: 120
};
const replayOneArg = simulateEndShiftAtomic(replayBase);
const replayFiveArg = simulateEndShiftAtomic({
  ...replayBase,
  p_parent_id: fakeParentId,
  p_end_iso: "2099-01-01T00:00:00.000Z",
  p_elapsed: 1,
  p_amount: 0.01
});
assert.deepEqual(replayOneArg, {
  ok: true,
  elapsedSeconds: 5400,
  amountNis: 120,
  endTime: end90m
});
assert.deepEqual(replayFiveArg, replayOneArg);

console.log("shift charge authority ok");
