import {
  isManualPaymentMethod,
  type ManualPaymentMethod
} from "@/lib/billing/manual-payment-lifecycle";
import {
  coerceBookingPaymentStatus,
  type BookingPaymentDisplayInput
} from "@/lib/bookings/payment-status-label";

export const MANUAL_PAYMENT_METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  cash: "מזומן",
  bit: "Bit",
  paybox: "PayBox"
};

export const MANUAL_PAYMENT_HEADING = "כמה נוח לך לשלם?";
export const MANUAL_PAYMENT_PAID_BUTTON = "שילמתי";

export const MANUAL_PAYMENT_CASH_TITLE = "תשלום במזומן";
export const MANUAL_PAYMENT_CASH_COPY = "לאחר מסירת התשלום לנני, לחצו על 'שילמתי'.";

export const MANUAL_PAYMENT_BIT_TITLE = "תשלום ב-Bit";
export const MANUAL_PAYMENT_PAYBOX_TITLE = "תשלום ב-PayBox";

export const AWAITING_SITTER_CONFIRMATION_HEADING = "ממתין לאישור הנני";
export const AWAITING_SITTER_CONFIRMATION_COPY =
  "דיווחנו לנני שהתשלום בוצע. לאחר אישור קבלת התשלום נמשיך לסגירת המשמרת.";

export const AWAITING_SITTER_RATING_HEADING = "ממתין לדירוג הנני";
export const PAYMENT_DISPUTE_HEADING = "בירור תשלום";

export const MANUAL_PAYMENT_REPORTED_NOTIFICATION = {
  kind: "manual_payment_reported",
  title: "ההורה דיווח שהתשלום בוצע",
  body: "יש לאשר האם התשלום התקבל."
} as const;

/** Destinations are only readable while the booking is still eligible for parent payment. */
export const PARENT_MANUAL_DESTINATION_ELIGIBLE_STATUSES = [
  "unpaid",
  "pending_checkout"
] as const;

export type ParentManualSettlementStep =
  | "rating"
  | "payment"
  | "waiting_sitter"
  | "dispute"
  | "waiting_sitter_rating";

export type ManualPaymentDestinations = {
  bookingId: string;
  cash: { available: true };
  bit: { available: boolean; destination?: string };
  paybox: { available: boolean; destination?: string };
};

export function eligibleManualPaymentMethods(input: {
  bitConfigured: boolean;
  payboxConfigured: boolean;
}): ManualPaymentMethod[] {
  const methods: ManualPaymentMethod[] = ["cash"];
  if (input.bitConfigured) methods.push("bit");
  if (input.payboxConfigured) methods.push("paybox");
  return methods;
}

export function manualPaymentMethodTitle(method: ManualPaymentMethod): string {
  if (method === "cash") return MANUAL_PAYMENT_CASH_TITLE;
  if (method === "bit") return MANUAL_PAYMENT_BIT_TITLE;
  return MANUAL_PAYMENT_PAYBOX_TITLE;
}

export function manualPaymentDestinationInstruction(method: "bit" | "paybox"): string {
  if (method === "bit") {
    return "שלמו לנני ב-Bit למספר הבא, ואז חזרו ל-AnyNanny ולחצו על 'שילמתי'.";
  }
  return "שלמו לנני ב-PayBox למספר הבא, ואז חזרו ל-AnyNanny ולחצו על 'שילמתי'.";
}

export function parseSelectedManualPaymentMethod(value: unknown): ManualPaymentMethod | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isManualPaymentMethod(normalized) ? normalized : null;
}

/**
 * Authoritative gate for revealing Bit/PayBox destinations.
 * Phones are never returned unless every condition is true.
 */
export function parentMayReadManualPaymentDestinations(input: {
  actorId: string;
  bookingParentId: string;
  bookingStatus?: string | null;
  paymentStatus?: string | null;
  hasParentRating: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const actorId = String(input.actorId ?? "").trim();
  const parentId = String(input.bookingParentId ?? "").trim();
  if (!actorId || !parentId || actorId !== parentId) {
    return { ok: false, reason: "not_owner" };
  }
  if (String(input.bookingStatus ?? "").trim().toLowerCase() !== "completed") {
    return { ok: false, reason: "shift_not_completed" };
  }
  const status = coerceBookingPaymentStatus(input.paymentStatus) ?? "unpaid";
  if (
    status !== "unpaid" &&
    status !== "pending_checkout"
  ) {
    return { ok: false, reason: "not_eligible_for_payment" };
  }
  if (!input.hasParentRating) {
    return { ok: false, reason: "parent_rating_required" };
  }
  return { ok: true };
}

/** Post-rating payment lifecycle panels driven by booking.payment_status. */
export function resolveParentManualSettlementStep(
  input: BookingPaymentDisplayInput
): Extract<
  ParentManualSettlementStep,
  "waiting_sitter" | "dispute" | "waiting_sitter_rating"
> | "idle_paid" | null {
  const status = coerceBookingPaymentStatus(input.paymentStatus);
  if (status === "payment_dispute") return "dispute";
  if (status === "awaiting_sitter_confirmation") return "waiting_sitter";
  if (status === "awaiting_sitter_rating") return "waiting_sitter_rating";
  if (status === "paid") return "idle_paid";
  return null;
}
