import type { BookingStatus } from "@/lib/bookings/constants";

export const CHAT_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export const CHAT_ACTIVE_WRITABLE_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

export const CHAT_CLOSED_SUPPORT_COPY = "ניתן לעיין בהיסטוריית ההודעות, אך לא לשלוח הודעות חדשות.";

export type ChatLifecycleSection = "active" | "past";
export type ChatLifecycleKind = "active" | "completed" | "cancelled" | "other";

export type ChatLifecycleInput = {
  status?: string | null;
  cancelledAt?: string | null;
  /** bookings.actual_end_time — actual shift end from end_shift_atomic (p_end_iso). */
  actualEndTime?: string | null;
  /** sessions.end_time — written at parent confirm-end when a session exists. */
  sessionEndTime?: string | null;
  /** bookings.end_time — scheduled shift end; last-resort completed fallback. */
  scheduledEndTime?: string | null;
};

export type ChatLifecycle = {
  writable: boolean;
  section: ChatLifecycleSection;
  kind: ChatLifecycleKind;
  closed: boolean;
  label: string | null;
  closedHeadline: string | null;
  closedSupport: string | null;
};

function parseTimeMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

/**
 * Authoritative completed-shift end, in priority order:
 * 1. bookings.actual_end_time
 * 2. sessions.end_time
 * 3. bookings.end_time (scheduled)
 */
export function resolveCompletedShiftEndMs(input: ChatLifecycleInput): number | null {
  return (
    parseTimeMs(input.actualEndTime) ??
    parseTimeMs(input.sessionEndTime) ??
    parseTimeMs(input.scheduledEndTime)
  );
}

export function getChatLifecycle(input: ChatLifecycleInput, nowMs: number): ChatLifecycle {
  const status = normalizeStatus(input.status);

  if ((CHAT_ACTIVE_WRITABLE_STATUSES as string[]).includes(status)) {
    return {
      writable: true,
      section: "active",
      kind: "active",
      closed: false,
      label: null,
      closedHeadline: null,
      closedSupport: null
    };
  }

  if (status === "cancelled") {
    const cancelledAtMs = parseTimeMs(input.cancelledAt);
    const writable = cancelledAtMs != null && nowMs <= cancelledAtMs + CHAT_GRACE_PERIOD_MS;
    return {
      writable,
      section: writable ? "active" : "past",
      kind: "cancelled",
      closed: !writable,
      label: writable ? "משמרת בוטלה" : "משמרת בוטלה · השיחה סגורה",
      closedHeadline: writable ? null : "השיחה נסגרה – המשמרת בוטלה.",
      closedSupport: writable ? null : CHAT_CLOSED_SUPPORT_COPY
    };
  }

  if (status === "completed") {
    const endedAtMs = resolveCompletedShiftEndMs(input);
    const writable = endedAtMs != null && nowMs <= endedAtMs + CHAT_GRACE_PERIOD_MS;
    return {
      writable,
      section: writable ? "active" : "past",
      kind: "completed",
      closed: !writable,
      label: writable ? "משמרת הסתיימה" : "משמרת הסתיימה · השיחה סגורה",
      closedHeadline: writable ? null : "השיחה נסגרה – המשמרת הסתיימה.",
      closedSupport: writable ? null : CHAT_CLOSED_SUPPORT_COPY
    };
  }

  return {
    writable: false,
    section: "past",
    kind: "other",
    closed: true,
    label: null,
    closedHeadline: "השיחה נסגרה.",
    closedSupport: CHAT_CLOSED_SUPPORT_COPY
  };
}

export function chatLifecycleFromInboxRow(
  row: {
    booking_status: string;
    cancelled_at?: string | null;
    actual_end_time?: string | null;
    session_end_time?: string | null;
    scheduled_end_time?: string | null;
  },
  nowMs: number
): ChatLifecycle {
  return getChatLifecycle(
    {
      status: row.booking_status,
      cancelledAt: row.cancelled_at,
      actualEndTime: row.actual_end_time,
      sessionEndTime: row.session_end_time,
      scheduledEndTime: row.scheduled_end_time
    },
    nowMs
  );
}
