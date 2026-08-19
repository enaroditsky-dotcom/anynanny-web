import { computeAuthoritativeShiftCharge } from "@/lib/billing/compute-shift-charge";
import { finalizeHypPaymentSuccess } from "@/lib/billing/finalize-hyp-payment";
import { getHypCredentials } from "@/lib/billing/hyp/create-transaction";
import {
  hypAmountsMatchMinorUnits,
  hypAmountToMinorUnits,
  hypCheckoutCorrelationMatches,
  verifiedBookingIdFromHypFields
} from "@/lib/billing/hyp/payment-authority";
import {
  isHypCapturedChargeCCode,
  normalizeHypSessionCandidate,
  normalizeHypUuidCandidate
} from "@/lib/billing/hyp/parse-return-params";
import {
  hasSufficientHypVerifyPayload,
  verifyHypTransaction,
  type HypVerifyFields
} from "@/lib/billing/hyp/verify-transaction";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompleteVerifiedHypInput = {
  parentId: string;
  bookingId?: string | null;
  sessionId?: string | null;
  originalQuery: string;
};

export type CompleteVerifiedHypResult =
  | { ok: true; bookingId: string; sessionIds: string[]; noop: boolean }
  | { ok: false; error: string; status: number; pending: true };

function fail(error: string, status: number): CompleteVerifiedHypResult {
  return { ok: false, error, status, pending: true };
}

export function originalQueryHasCapturedCharge(fields: Pick<HypVerifyFields, "cCode">): boolean {
  return isHypCapturedChargeCCode(fields.cCode);
}

export async function completeVerifiedHypPayment(
  supabase: SupabaseClient,
  input: CompleteVerifiedHypInput
): Promise<CompleteVerifiedHypResult> {
  const parentId = input.parentId.trim();
  const originalQuery = String(input.originalQuery ?? "").trim();
  if (!parentId) return fail("Unauthorized.", 401);
  if (!originalQuery) {
    return fail("Hyp return payload is required for server-side VERIFY.", 400);
  }
  if (!hasSufficientHypVerifyPayload(originalQuery)) {
    return fail(
      "Hyp return payload is missing the documented VERIFY fields (Sign, Id, Amount, CCode).",
      400
    );
  }

  const verified = await verifyHypTransaction(originalQuery);
  if (!verified.ok) {
    return fail(verified.error, 400);
  }

  if (!originalQueryHasCapturedCharge(verified.fields)) {
    return fail("Hyp transaction is not an approved captured charge.", 400);
  }

  const hintedBookingId =
    normalizeHypUuidCandidate(input.bookingId) || verifiedBookingIdFromHypFields(verified.fields);
  if (!hintedBookingId) {
    return fail("Could not correlate Hyp payment to a booking.", 400);
  }

  const hintedSessionId =
    normalizeHypSessionCandidate(input.sessionId) ||
    normalizeHypSessionCandidate(verified.fields.moreData);

  let expectedMasof: string | null = null;
  try {
    expectedMasof = getHypCredentials().masof;
  } catch {
    expectedMasof = null;
  }

  if (
    !hypCheckoutCorrelationMatches({
      bookingId: hintedBookingId,
      sessionId: hintedSessionId,
      fields: verified.fields,
      expectedMasof
    })
  ) {
    return fail("Verified Hyp payment does not match this booking.", 400);
  }

  const chargeResult = await computeAuthoritativeShiftCharge(supabase, parentId, {
    bookingId: hintedBookingId,
    sessionId: hintedSessionId
  });
  if (!chargeResult.ok) {
    return fail(chargeResult.error, chargeResult.status);
  }

  if (!hypAmountsMatchMinorUnits(verified.fields.amount, chargeResult.charge.amountMinorUnits)) {
    return fail("Verified Hyp amount does not match the authoritative shift charge.", 400);
  }

  const verifiedMinor = hypAmountToMinorUnits(verified.fields.amount);
  if (verifiedMinor == null) {
    return fail("Verified Hyp payload is missing a numeric Amount.", 400);
  }
  const verifiedAmountNis = Number((verifiedMinor / 100).toFixed(2));
  const finalized = await finalizeHypPaymentSuccess(supabase, {
    bookingId: hintedBookingId,
    sessionId: chargeResult.charge.sessionId,
    parentId,
    hypTransId: verified.fields.transId!,
    verifiedAmountNis
  });

  if (!finalized.ok) {
    return fail(finalized.error, finalized.status ?? 400);
  }

  return {
    ok: true,
    bookingId: finalized.bookingId,
    sessionIds: finalized.sessionIds,
    noop: finalized.noop
  };
}
