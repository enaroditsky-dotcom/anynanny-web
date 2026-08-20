export const CANONICAL_NOTIFICATION_KINDS = [
  "booking_request",
  "booking_approved",
  "booking_rejected",
  "chat_message",
  "broadcast_alert",
  "booking_cancellation_requested",
  "booking_cancellation_approved",
  "payment_required",
  "payment_received"
] as const;

export type CanonicalNotificationKind = (typeof CANONICAL_NOTIFICATION_KINDS)[number];

/** Documented V1 kinds that are intentionally not written in this phase. */
export const DEFERRED_NOTIFICATION_KINDS = [
  "booking_cancellation_rejected",
  "confirm_start_required",
  "confirm_end_required",
  "rating_required"
] as const;

export type DeferredNotificationKind = (typeof DEFERRED_NOTIFICATION_KINDS)[number];

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
  hyp_approval_id?: string | null;
  session_ids?: string[] | null;
  amount?: string | null;
  gateway?: string | null;
};

export function isCanonicalNotificationKind(value: string): value is CanonicalNotificationKind {
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
  }
): string | null {
  if (kind === "chat_message") return ids.messageId?.trim() || null;
  if (kind === "broadcast_alert") return ids.broadcastId?.trim() || null;
  if (kind === "payment_required") return ids.sessionId?.trim() || ids.bookingId?.trim() || null;
  if (kind === "payment_received") return ids.bookingId?.trim() || ids.hypApprovalId?.trim() || null;
  return ids.bookingId?.trim() || null;
}

/** Later Web Push click targets. Role chooses parent vs sitter prefix. */
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
  if (kind === "broadcast_alert") return "/sitter/dashboard";
  if (kind.startsWith("booking_cancellation")) {
    return role === "parent" ? "/parent/calendar" : "/sitter/shifts";
  }
  if (kind === "booking_request") return "/sitter/dashboard";
  return role === "parent" ? "/parent/dashboard" : "/sitter/dashboard";
}
