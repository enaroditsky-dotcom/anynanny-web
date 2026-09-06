import { isInternalBroadcastCtaRoute } from "@/lib/admin/broadcast-cta";
import { calendarBookingHref } from "@/lib/bookings/calendar-booking-href";

export const CANONICAL_NOTIFICATION_KINDS = [
  "booking_request",
  "booking_approved",
  "booking_rejected",
  "chat_message",
  "broadcast_alert",
  "booking_cancellation_requested",
  "booking_cancellation_approved",
  "payment_required",
  "payment_received",
  "pending_no_response_reminder",
  "booking_withdrawn_by_parent",
  "pending_booking_expired",
  "shift_end_reminder",
  "shift_cancelled_no_start",
  "shift_confirmed",
  "missed_shift_clarification",
  "manual_payment_reported",
  "manual_payment_confirmed",
  "manual_payment_denied",
  "manual_payment_resolved_reported",
  "admin_broadcast",
] as const;

export type CanonicalNotificationKind =
  (typeof CANONICAL_NOTIFICATION_KINDS)[number];

/** Documented V1 kinds that are intentionally not written in this phase. */
export const DEFERRED_NOTIFICATION_KINDS = [
  "booking_cancellation_rejected",
  "confirm_start_required",
  "confirm_end_required",
  "rating_required",
] as const;

export type DeferredNotificationKind =
  (typeof DEFERRED_NOTIFICATION_KINDS)[number];

export type CanonicalNotificationPayload = {
  booking_id?: string | null;
  session_id?: string | null;
  message_id?: string | null;
  sender_id?: string | null;
  parent_id?: string | null;
  sitter_id?: string | null;
  broadcast_id?: string | null;
  alert_id?: string | null;
  city?: string | null;
  service_type?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  requested_by?: string | null;
  requested_role?: string | null;
  approved_by?: string | null;
  approved_role?: string | null;
  cancelled_by?: string | null;
  cancelled_role?: string | null;
  recipient_role?: string | null;
  cancellation_reason?: string | null;
  hyp_approval_id?: string | null;
  session_ids?: string[] | null;
  amount?: string | null;
  gateway?: string | null;
  payment_method?: string | null;
  cta_route?: string | null;
  cta_label?: string | null;
  is_test?: boolean | null;
};

export function isCanonicalNotificationKind(
  value: string
): value is CanonicalNotificationKind {
  return (CANONICAL_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function notificationDedupeKey(
  kind: CanonicalNotificationKind,
  ids: {
    bookingId?: string | null;
    messageId?: string | null;
    broadcastId?: string | null;
    sessionId?: string | null;
    hypApprovalId?: string | null;
    resolvedAt?: string | null;
  }
): string | null {
  if (kind === "chat_message") return ids.messageId?.trim() || null;
  if (kind === "broadcast_alert" || kind === "admin_broadcast") {
    return ids.broadcastId?.trim() || null;
  }

  if (kind === "payment_required") {
    return ids.sessionId?.trim() || ids.bookingId?.trim() || null;
  }

  if (kind === "payment_received") {
    return ids.bookingId?.trim() || ids.hypApprovalId?.trim() || null;
  }

  if (kind === "manual_payment_resolved_reported") {
    const bookingId = ids.bookingId?.trim();
    if (!bookingId) return null;
    const stamp = ids.resolvedAt?.trim();
    return stamp ? `${bookingId}:${stamp}` : bookingId;
  }

  return ids.bookingId?.trim() || null;
}

export function notificationHrefForKind(
  kind: CanonicalNotificationKind,
  role: "parent" | "sitter",
  payload: CanonicalNotificationPayload
): string {
  const bookingId = String(payload.booking_id ?? "").trim();

  if (kind === "chat_message" && bookingId) {
    return `/${role}/chat/${encodeURIComponent(bookingId)}`;
  }

  if (kind === "payment_received") return "/sitter/wallet";
  if (kind === "payment_required") return "/parent/dashboard";
  if (
    kind === "manual_payment_reported" ||
    kind === "manual_payment_resolved_reported"
  ) {
    return "/sitter/dashboard";
  }
  if (kind === "manual_payment_confirmed" || kind === "manual_payment_denied") {
    return "/parent/dashboard";
  }
  if (kind === "broadcast_alert") return "/sitter/dashboard";
  if (kind === "admin_broadcast") {
    const ctaRoute = String(payload.cta_route ?? "").trim();
    if (ctaRoute && isInternalBroadcastCtaRoute(ctaRoute)) return ctaRoute;
    return role === "parent" ? "/parent/dashboard" : "/sitter/dashboard";
  }

  if (kind.startsWith("booking_cancellation")) {
    return calendarBookingHref(
      role === "parent" ? "/parent/calendar" : "/sitter/shifts",
      bookingId
    );
  }

  if (kind === "booking_request") return "/sitter/dashboard";

  if (
    kind === "pending_no_response_reminder" ||
    kind === "pending_booking_expired"
  ) {
    return bookingId
      ? calendarBookingHref("/parent/calendar", bookingId)
      : "/parent/dashboard";
  }

  if (
    kind === "shift_end_reminder" ||
    kind === "shift_cancelled_no_start" ||
    kind === "missed_shift_clarification"
  ) {
    return role === "parent"
      ? "/parent/dashboard"
      : "/sitter/dashboard";
  }

  if (kind === "booking_withdrawn_by_parent") {
    return "/sitter/dashboard";
  }

  if (kind === "shift_confirmed") {
    return calendarBookingHref("/sitter/shifts", bookingId);
  }

  if (kind === "booking_approved" || kind === "booking_rejected") {
    return bookingId
      ? calendarBookingHref("/parent/calendar", bookingId)
      : "/parent/dashboard";
  }

  return role === "parent"
    ? "/parent/dashboard"
    : "/sitter/dashboard";
}

