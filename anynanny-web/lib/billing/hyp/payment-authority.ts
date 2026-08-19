import { hypOrderFromBookingId } from "@/lib/billing/hyp/create-transaction";
import { normalizeHypSessionCandidate, normalizeHypUuidCandidate } from "@/lib/billing/hyp/parse-return-params";
import type { HypVerifyFields } from "@/lib/billing/hyp/verify-transaction";

/** Same MoreData format checkout sends: Session_<uuid>. */
export function hypSessionMoreData(sessionId: string): string {
  return `Session_${sessionId.trim()}`;
}

export function hypAmountToMinorUnits(raw: string | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function hypAmountsMatchMinorUnits(
  hypAmount: string | null | undefined,
  expectedMinorUnits: number
): boolean {
  const actual = hypAmountToMinorUnits(hypAmount);
  if (actual == null) return false;
  if (!Number.isInteger(expectedMinorUnits) || expectedMinorUnits < 0) return false;
  return actual === expectedMinorUnits;
}

export function verifiedBookingIdFromHypFields(fields: Pick<HypVerifyFields, "info" | "order">): string | null {
  return normalizeHypUuidCandidate(fields.info) || normalizeHypUuidCandidate(fields.order);
}

export function hypCheckoutCorrelationMatches(input: {
  bookingId: string;
  sessionId?: string | null;
  fields: Pick<HypVerifyFields, "info" | "order" | "moreData" | "coin" | "masof">;
  expectedMasof?: string | null;
}): boolean {
  const bookingId = input.bookingId.trim().toLowerCase();
  if (!bookingId) return false;

  const infoId = normalizeHypUuidCandidate(input.fields.info);
  const order = String(input.fields.order ?? "").trim();
  const expectedOrder = hypOrderFromBookingId(input.bookingId);

  const infoMatches = infoId === bookingId;
  const orderMatches = order.toLowerCase() === expectedOrder.toLowerCase();
  if (!infoMatches && !orderMatches) return false;
  if (infoId && infoId !== bookingId) return false;
  if (order && order.toLowerCase() !== expectedOrder.toLowerCase()) return false;

  const moreData = String(input.fields.moreData ?? "").trim();
  const sessionId = input.sessionId?.trim() || null;
  if (moreData && sessionId) {
    const fromMore =
      normalizeHypSessionCandidate(moreData) ||
      normalizeHypSessionCandidate(
        moreData.split(/[|,;]/).find((part) => /^session/i.test(part.trim())) ?? null
      );
    if (fromMore && fromMore !== sessionId.toLowerCase()) return false;
    if (!fromMore && moreData.toLowerCase() !== hypSessionMoreData(sessionId).toLowerCase()) {
      return false;
    }
  }

  const coin = String(input.fields.coin ?? "").trim();
  if (coin && coin !== "1") return false;

  const masof = String(input.fields.masof ?? "").trim();
  const expectedMasof = String(input.expectedMasof ?? "").trim();
  if (masof && expectedMasof && masof !== expectedMasof) return false;

  return true;
}

export type HypFinalizeDecision =
  | { action: "pay" }
  | { action: "noop" }
  | { action: "reject"; reason: string };

export function decideHypFinalizeAction(input: {
  bookingPaid: boolean;
  bookingHypTransId: string | null | undefined;
  incomingHypTransId: string;
  otherBookingIdWithSameTransId: string | null | undefined;
  expectedMinorUnits: number;
  incomingMinorUnits: number;
}): HypFinalizeDecision {
  const incoming = String(input.incomingHypTransId ?? "").trim();
  if (!incoming) {
    return { action: "reject", reason: "missing_trans_id" };
  }
  if (input.incomingMinorUnits !== input.expectedMinorUnits) {
    return { action: "reject", reason: "amount_mismatch" };
  }
  const other = input.otherBookingIdWithSameTransId?.trim() || null;
  if (other) {
    return { action: "reject", reason: "trans_id_used_elsewhere" };
  }
  if (input.bookingPaid) {
    const existing = String(input.bookingHypTransId ?? "").trim();
    if (existing && existing === incoming) return { action: "noop" };
    return { action: "reject", reason: "already_paid_different_transaction" };
  }
  return { action: "pay" };
}
