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

export const AWAITING_SITTER_RATING_HEADING = "ממתין לדירוג מבייביסיטר";
export const PAYMENT_DISPUTE_HEADING = "בירור תשלום";
export const PAYMENT_DISPUTE_PARENT_HEADING = "בבירור תשלום";
export const PARENT_PAYMENT_DISPUTE_SITTER_DENIED_MESSAGE =
  "הנני דיווחה שהתשלום טרם התקבל." as const;
export const PARENT_RESOLVE_PAYMENT_DISPUTE_BUTTON = "הסדרתי את התשלום" as const;

export const MANUAL_PAYMENT_REPORTED_BY_METHOD: Record<ManualPaymentMethod, string> = {
  cash: "ההורה דיווח ששילם במזומן",
  bit: "ההורה דיווח ששילם ב-Bit",
  paybox: "ההורה דיווח ששילם ב-PayBox"
};

export const MANUAL_PAYMENT_REPORTED_NOTIFICATION = {
  kind: "manual_payment_reported",
  title: "ההורה דיווח שהתשלום בוצע",
  body: "יש לאשר האם התשלום התקבל."
} as const;

export function parentReportedPaidByMethodCopy(
  method: string | null | undefined
): string | null {
  const parsed = parseSelectedManualPaymentMethod(method);
  return parsed ? MANUAL_PAYMENT_REPORTED_BY_METHOD[parsed] : null;
}

export function manualPaymentReportedNotificationCopy(
  method: string | null | undefined
): { title: string; body: string } {
  const reported = parentReportedPaidByMethodCopy(method);
  if (!reported) {
    return {
      title: MANUAL_PAYMENT_REPORTED_NOTIFICATION.title,
      body: MANUAL_PAYMENT_REPORTED_NOTIFICATION.body
    };
  }
  return { title: reported, body: reported };
}

export const SITTER_MANUAL_PAYMENT_PROMPT =
  "ההורה דיווח שהתשלום בוצע. האם קיבלת את התשלום?" as const;

export function sitterManualPaymentPromptForMethod(
  method: string | null | undefined
): string {
  const reported = parentReportedPaidByMethodCopy(method);
  if (!reported) return SITTER_MANUAL_PAYMENT_PROMPT;
  return `${reported}. האם קיבלת את התשלום?`;
}

export const SITTER_CONFIRM_RECEIVED_BUTTON = "כן, קיבלתי" as const;
export const SITTER_DENY_RECEIVED_BUTTON = "לא קיבלתי" as const;
export const SITTER_AWAITING_RATING_LABEL = "ממתין לדירוג" as const;

export const MANUAL_PAYMENT_CONFIRMED_NOTIFICATION = {
  kind: "manual_payment_confirmed",
  title: "קבלת התשלום אושרה",
  body: "הנני אישרה שהתשלום התקבל."
} as const;

export const MANUAL_PAYMENT_DENIED_NOTIFICATION = {
  kind: "manual_payment_denied",
  title: "התשלום לא אושר",
  body: "הנני דיווחה שהתשלום טרם התקבל. יש להסדיר את התשלום לפני הזמנה חדשה."
} as const;

export const MANUAL_PAYMENT_RESOLVED_REPORTED_NOTIFICATION = {
  kind: "manual_payment_resolved_reported",
  title: "ההורה דיווח שהתשלום הוסדר",
  body: "יש לאשר האם התשלום התקבל."
} as const;

export const SITTER_MANUAL_ACTIONABLE_STATUSES = [
  "awaiting_sitter_confirmation",
  "awaiting_sitter_rating",
  "payment_dispute"
] as const;

export type SitterManualPaymentStep = "confirm" | "rate" | "dispute" | "paid" | "waiting_parent";

export function resolveSitterManualPaymentStep(
  paymentStatus: string | null | undefined
): SitterManualPaymentStep | null {
  const status = coerceBookingPaymentStatus(paymentStatus);
  if (status === "awaiting_sitter_confirmation") return "confirm";
  if (status === "awaiting_sitter_rating") return "rate";
  if (status === "payment_dispute") return "dispute";
  if (status === "paid") return "paid";
  if (status === "unpaid" || status === "pending_checkout") return "waiting_parent";
  return null;
}

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
  paybox: { available: boolean; destination?: string; link?: string };
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

export const MANUAL_PAYMENT_PAYBOX_OPEN_BUTTON = "פתח PayBox";

export const MANUAL_PAYMENT_PAYBOX_LINK_COPY =
  "לחצו על 'פתח PayBox' לתשלום, ואז חזרו ל-AnyNanny ולחצו על 'שילמתי'.";

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

/**
 * Parent may resolve a payment_dispute only for their own manual-rail booking,
 * reusing the stored cash|bit|paybox method. Idempotent if already awaiting confirmation.
 */
export function parentMayResolveManualPaymentDispute(input: {
  actorId: string;
  bookingParentId: string;
  paymentStatus?: string | null;
  paymentRail?: string | null;
  paymentMethod?: string | null;
}):
  | { ok: true; paymentMethod: ManualPaymentMethod | null; noop: boolean }
  | { ok: false; reason: string } {
  const actorId = String(input.actorId ?? "").trim();
  const parentId = String(input.bookingParentId ?? "").trim();
  if (!actorId || !parentId || actorId !== parentId) {
    return { ok: false, reason: "not_owner" };
  }

  const rail = String(input.paymentRail ?? "").trim().toLowerCase();
  if (rail === "processor") {
    return { ok: false, reason: "processor_rail" };
  }

  const status = coerceBookingPaymentStatus(input.paymentStatus) ?? "unpaid";
  if (status === "awaiting_sitter_confirmation") {
    return {
      ok: true,
      paymentMethod: parseSelectedManualPaymentMethod(input.paymentMethod),
      noop: true
    };
  }
  if (status !== "payment_dispute") {
    return { ok: false, reason: "invalid_from_status" };
  }

  const method = parseSelectedManualPaymentMethod(input.paymentMethod);
  if (!method) {
    return { ok: false, reason: "invalid_method" };
  }
  return { ok: true, paymentMethod: method, noop: false };
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
