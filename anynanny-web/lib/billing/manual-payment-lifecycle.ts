import type { BookingPaymentStatus } from "@/lib/bookings/constants";

export const MANUAL_PAYMENT_METHODS = ["cash", "bit", "paybox"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const MANUAL_PAYMENT_RAIL = "manual" as const;
export const PROCESSOR_PAYMENT_RAIL = "processor" as const;
export type PaymentRail = typeof MANUAL_PAYMENT_RAIL | typeof PROCESSOR_PAYMENT_RAIL;

export const BOOKING_PAYMENT_STATUSES = [
  "unpaid",
  "pending_checkout",
  "awaiting_sitter_confirmation",
  "payment_dispute",
  "awaiting_sitter_rating",
  "paid"
] as const satisfies readonly BookingPaymentStatus[];

export type ManualPaymentAction =
  | "report"
  | "confirm"
  | "deny"
  | "mark_paid";

export type PaymentActorRole = "parent" | "sitter" | "other";

export const PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE =
  "קיים תשלום שטרם אושר. יש להסדיר אותו לפני הזמנה חדשה." as const;

export const SITTER_RATE_BEFORE_CONFIRMATION_MESSAGE =
  "ניתן לדרג את המשפחה רק לאחר אישור קבלת התשלום." as const;

const MANUAL_METHOD_SET = new Set<string>(MANUAL_PAYMENT_METHODS);

export function isManualPaymentMethod(value: unknown): value is ManualPaymentMethod {
  return MANUAL_METHOD_SET.has(String(value ?? "").trim().toLowerCase());
}

export function parseManualPaymentMethod(value: unknown): ManualPaymentMethod | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isManualPaymentMethod(normalized) ? normalized : null;
}

/** Sitter → parent rating is allowed only after confirm, or after processor paid. */
export function sitterMayRateParent(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === "awaiting_sitter_rating" || paymentStatus === "paid";
}

export function sitterMustNotRateParent(paymentStatus: string | null | undefined): boolean {
  return (
    paymentStatus === "unpaid" ||
    paymentStatus === "pending_checkout" ||
    paymentStatus === "awaiting_sitter_confirmation" ||
    paymentStatus === "payment_dispute"
  );
}

export function parentHasUnresolvedPaymentDispute(
  paymentStatuses: readonly (string | null | undefined)[]
): boolean {
  return paymentStatuses.some((status) => status === "payment_dispute");
}

export type ManualPaymentTransitionInput = {
  action: ManualPaymentAction;
  actor: PaymentActorRole;
  paymentStatus: string | null | undefined;
  paymentMethod?: string | null;
  hasParentRating?: boolean;
  hasSitterRating?: boolean;
  bookingStatus?: string | null;
};

export type ManualPaymentTransitionResult =
  | { ok: true; nextStatus: BookingPaymentStatus; noop: boolean }
  | { ok: false; reason: string };

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Authoritative client-side mirror of the Phase 1a SQL state machine.
 * Server RPCs remain the only writers of payment_status.
 */
export function evaluateManualPaymentTransition(
  input: ManualPaymentTransitionInput
): ManualPaymentTransitionResult {
  const status = normalizeStatus(input.paymentStatus) || "unpaid";

  if (input.action === "report") {
    if (input.actor !== "parent") {
      return { ok: false, reason: "parent_only" };
    }
    if (!isManualPaymentMethod(input.paymentMethod)) {
      return { ok: false, reason: "invalid_method" };
    }
    if (status === "awaiting_sitter_confirmation") {
      return { ok: true, nextStatus: "awaiting_sitter_confirmation", noop: true };
    }
    if (status !== "unpaid" && status !== "payment_dispute") {
      return { ok: false, reason: "invalid_from_status" };
    }
    if (input.bookingStatus != null && input.bookingStatus !== "completed") {
      return { ok: false, reason: "shift_not_completed" };
    }
    if (input.hasParentRating === false) {
      return { ok: false, reason: "parent_rating_required" };
    }
    return { ok: true, nextStatus: "awaiting_sitter_confirmation", noop: false };
  }

  if (input.action === "confirm") {
    if (input.actor !== "sitter") {
      return { ok: false, reason: "sitter_only" };
    }
    if (status === "awaiting_sitter_rating") {
      return { ok: true, nextStatus: "awaiting_sitter_rating", noop: true };
    }
    if (status !== "awaiting_sitter_confirmation") {
      return { ok: false, reason: "invalid_from_status" };
    }
    return { ok: true, nextStatus: "awaiting_sitter_rating", noop: false };
  }

  if (input.action === "deny") {
    if (input.actor !== "sitter") {
      return { ok: false, reason: "sitter_only" };
    }
    if (status === "payment_dispute") {
      return { ok: true, nextStatus: "payment_dispute", noop: true };
    }
    if (status !== "awaiting_sitter_confirmation") {
      return { ok: false, reason: "invalid_from_status" };
    }
    return { ok: true, nextStatus: "payment_dispute", noop: false };
  }

  if (input.actor !== "sitter") {
    return { ok: false, reason: "sitter_only" };
  }
  if (status === "paid") {
    return { ok: true, nextStatus: "paid", noop: true };
  }
  if (status !== "awaiting_sitter_rating") {
    return { ok: false, reason: "invalid_from_status" };
  }
  if (input.hasSitterRating !== true) {
    return { ok: false, reason: "sitter_rating_required" };
  }
  return { ok: true, nextStatus: "paid", noop: false };
}

export function clientMayWritePaymentStatus(
  currentUser: string,
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined
): boolean {
  if (currentUser !== "authenticated" && currentUser !== "anon") {
    return true;
  }
  const from = normalizeStatus(fromStatus) || "unpaid";
  const to = normalizeStatus(toStatus);
  return from === "unpaid" && to === "pending_checkout";
}
