import type { BookingPaymentStatus } from "@/lib/bookings/constants";

/** Presentation-only mapping of stored booking payment fields. Never infers paid from shift completion. */

export type BookingPaymentDisplayKind =
  | "unpaid"
  | "pending_checkout"
  | "awaiting_sitter_confirmation"
  | "payment_dispute"
  | "awaiting_sitter_rating"
  | "paid";

export type BookingPaymentDisplayInput = {
  paymentStatus?: string | null;
  paidAt?: string | null;
};

export const BOOKING_SHIFT_ENDED_LABEL = "הסתיימה";

export const BOOKING_PAYMENT_STATUS_LABELS = {
  unpaid: "ממתינה לתשלום",
  pending_checkout: "התשלום לא הושלם",
  awaiting_sitter_confirmation: "ממתין לאישור הנני",
  payment_dispute: "בירור תשלום",
  awaiting_sitter_rating: "ממתין לדירוג מבייביסיטר",
  paid: "שולם"
} as const;

export const PARENT_COMPLETED_SHIFT_PAYMENT_ACTION = {
  unpaid: "שלם עכשיו",
  pending_checkout: "נסה לשלם שוב"
} as const;

export const PARENT_PAYMENT_BOOKING_QUERY_PARAM = "paymentBookingId";

const BOOKING_PAYMENT_STATUSES = new Set<BookingPaymentStatus>([
  "unpaid",
  "pending_checkout",
  "paid",
  "awaiting_sitter_confirmation",
  "payment_dispute",
  "awaiting_sitter_rating"
]);

const INTERMEDIATE_MANUAL_PAYMENT_STATUSES = new Set<BookingPaymentStatus>([
  "awaiting_sitter_confirmation",
  "payment_dispute",
  "awaiting_sitter_rating"
]);

export function coerceBookingPaymentStatus(value: unknown): BookingPaymentStatus | null {
  const status = String(value ?? "").trim().toLowerCase();
  return BOOKING_PAYMENT_STATUSES.has(status as BookingPaymentStatus)
    ? (status as BookingPaymentStatus)
    : null;
}

export function parsePaymentBookingIdParam(raw: string | null | undefined): string | null {
  const id = String(raw ?? "").trim();
  if (!id || id.length > 80) return null;
  if (!/^[0-9a-z][0-9a-z_-]{7,79}$/i.test(id)) return null;
  return id;
}

export function parentPaymentRecoveryHref(bookingId: string): string {
  const id = parsePaymentBookingIdParam(bookingId);
  if (!id) return "/parent/dashboard";
  return `/parent/dashboard?${PARENT_PAYMENT_BOOKING_QUERY_PARAM}=${encodeURIComponent(id)}`;
}

export function isBookingPaymentPaid(input: BookingPaymentDisplayInput): boolean {
  const status = coerceBookingPaymentStatus(input.paymentStatus);
  if (status === "paid") return true;
  if (status === "pending_checkout" || (status && INTERMEDIATE_MANUAL_PAYMENT_STATUSES.has(status))) {
    return false;
  }
  const paidAt = input.paidAt;
  return paidAt != null && String(paidAt).trim() !== "";
}

/**
 * Paid only from payment_status === "paid" or a non-empty paid_at on unpaid/unknown.
 * Intermediate manual statuses never fall back to unpaid or paid.
 * Missing / unknown payment_status is unpaid — never "paid" from completed.
 */
export function resolveBookingPaymentDisplayKind(
  input: BookingPaymentDisplayInput
): BookingPaymentDisplayKind {
  const status = coerceBookingPaymentStatus(input.paymentStatus);
  if (status === "awaiting_sitter_confirmation") return "awaiting_sitter_confirmation";
  if (status === "payment_dispute") return "payment_dispute";
  if (status === "awaiting_sitter_rating") return "awaiting_sitter_rating";
  if (status === "pending_checkout") return "pending_checkout";
  if (isBookingPaymentPaid(input)) return "paid";
  return "unpaid";
}

export function bookingPaymentStatusLabel(input: BookingPaymentDisplayInput): string {
  return BOOKING_PAYMENT_STATUS_LABELS[resolveBookingPaymentDisplayKind(input)];
}

export function parentCompletedShiftPaymentActionLabel(
  input: BookingPaymentDisplayInput
): string | null {
  const kind = resolveBookingPaymentDisplayKind(input);
  if (kind === "unpaid") return PARENT_COMPLETED_SHIFT_PAYMENT_ACTION.unpaid;
  if (kind === "pending_checkout") return PARENT_COMPLETED_SHIFT_PAYMENT_ACTION.pending_checkout;
  return null;
}
