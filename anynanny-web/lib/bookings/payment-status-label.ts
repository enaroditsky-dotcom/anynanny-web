import type { BookingPaymentStatus } from "@/lib/bookings/constants";

/** Presentation-only mapping of stored booking payment fields. Never infers paid from shift completion. */

export type BookingPaymentDisplayKind = "unpaid" | "pending_checkout" | "paid";

export type BookingPaymentDisplayInput = {
  paymentStatus?: string | null;
  paidAt?: string | null;
};

export const BOOKING_SHIFT_ENDED_LABEL = "הסתיימה";

export const BOOKING_PAYMENT_STATUS_LABELS = {
  unpaid: "ממתינה לתשלום",
  pending_checkout: "התשלום לא הושלם",
  paid: "שולם"
} as const;

export const PARENT_COMPLETED_SHIFT_PAYMENT_ACTION = {
  unpaid: "שלם עכשיו",
  pending_checkout: "נסה לשלם שוב"
} as const;

export const PARENT_PAYMENT_BOOKING_QUERY_PARAM = "paymentBookingId";

export function coerceBookingPaymentStatus(value: unknown): BookingPaymentStatus | null {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "paid" || status === "pending_checkout" || status === "unpaid") {
    return status;
  }
  return null;
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
  if (coerceBookingPaymentStatus(input.paymentStatus) === "paid") return true;
  const paidAt = input.paidAt;
  return paidAt != null && String(paidAt).trim() !== "";
}

/**
 * Paid only from payment_status === "paid" or a non-empty paid_at.
 * Missing / unknown payment_status is unpaid — never "paid" from completed.
 */
export function resolveBookingPaymentDisplayKind(
  input: BookingPaymentDisplayInput
): BookingPaymentDisplayKind {
  if (isBookingPaymentPaid(input)) return "paid";
  if (coerceBookingPaymentStatus(input.paymentStatus) === "pending_checkout") {
    return "pending_checkout";
  }
  return "unpaid";
}

export function bookingPaymentStatusLabel(input: BookingPaymentDisplayInput): string {
  return BOOKING_PAYMENT_STATUS_LABELS[resolveBookingPaymentDisplayKind(input)];
}

export function parentCompletedShiftPaymentActionLabel(
  input: BookingPaymentDisplayInput
): string | null {
  const kind = resolveBookingPaymentDisplayKind(input);
  if (kind === "paid") return null;
  return PARENT_COMPLETED_SHIFT_PAYMENT_ACTION[kind];
}
