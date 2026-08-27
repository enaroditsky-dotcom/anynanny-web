import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import {
  notificationHrefForKind,
  type CanonicalNotificationKind,
  type CanonicalNotificationPayload
} from "@/lib/notifications/kinds";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

/** In-app coordination events. Chat, broadcast, and payment stay on their existing surfaces. */
export const COORDINATION_NOTIFICATION_KINDS = [
  "booking_request",
  "booking_approved",
  "booking_rejected",
  "booking_cancellation_requested",
  "booking_cancellation_approved",
  "pending_no_response_reminder",
  "booking_withdrawn_by_parent",
  "pending_booking_expired",
  "shift_confirmed"
] as const satisfies readonly CanonicalNotificationKind[];

export type CoordinationNotificationKind = (typeof COORDINATION_NOTIFICATION_KINDS)[number];

export type CoordinationNotification = {
  id: string;
  kind: CoordinationNotificationKind;
  title: string;
  body: string;
  payload: CanonicalNotificationPayload;
  created_at: string;
  read_at: string | null;
};

const COORDINATION_KIND_SET = new Set<string>(COORDINATION_NOTIFICATION_KINDS);

const COORDINATION_TITLE: Record<CoordinationNotificationKind, string> = {
  booking_request: "בקשת תיאום משמרת",
  booking_approved: "הבייביסיטר אישרה את המשמרת!",
  booking_rejected: "הבקשה נדחתה",
  booking_cancellation_requested: "התקבלה בקשת ביטול למשמרת",
  booking_cancellation_approved: "עודכן סטטוס ביטול המשמרת",
  pending_no_response_reminder: "הבייביסיטר עדיין לא הגיבה לבקשתך",
  booking_withdrawn_by_parent: "ההורה ביטל את בקשת המשמרת",
  pending_booking_expired: "הבקשה נסגרה",
  shift_confirmed: "המשמרת אושרה בהצלחה"
};

export function isCoordinationNotificationKind(value: string): value is CoordinationNotificationKind {
  return COORDINATION_KIND_SET.has(value);
}

export function coordinationNotificationTitle(
  kind: CoordinationNotificationKind,
  fallbackTitle?: string | null
): string {
  return COORDINATION_TITLE[kind] || String(fallbackTitle ?? "").trim() || "עדכון תיאום משמרת";
}

export function coordinationBookingHref(
  kind: CoordinationNotificationKind,
  role: "parent" | "sitter",
  payload: CanonicalNotificationPayload
): string {
  return notificationHrefForKind(kind, role, payload);
}

export function coordinationChatHref(
  role: "parent" | "sitter",
  payload: CanonicalNotificationPayload
): string | null {
  const bookingId = String(payload.booking_id ?? "").trim();
  if (!bookingId) return null;
  return `/${role}/chat/${encodeURIComponent(bookingId)}`;
}

export function coordinationScheduleLabel(payload: CanonicalNotificationPayload): string | null {
  const bookingDate = String(payload.booking_date ?? "").trim();
  const startTime = String(payload.start_time ?? "").trim();
  const endTime = String(payload.end_time ?? "").trim();
  if (!bookingDate || !startTime || !endTime) return null;
  try {
    return formatBookingSchedule({
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime
    });
  } catch {
    return null;
  }
}

export function mapCoordinationNotificationRow(row: Record<string, unknown>): CoordinationNotification | null {
  const id = String(row.id ?? "").trim();
  const kindRaw = String(row.kind ?? "").trim();
  if (!id || !isCoordinationNotificationKind(kindRaw)) return null;
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as CanonicalNotificationPayload)
      : {};
  const readAt = row.read_at == null || row.read_at === "" ? null : String(row.read_at);
  return {
    id,
    kind: kindRaw,
    title: coordinationNotificationTitle(kindRaw, row.title != null ? String(row.title) : null),
    body: String(row.body ?? "").trim(),
    payload,
    created_at: String(row.created_at ?? ""),
    read_at: readAt
  };
}

function sortNewestFirst(rows: CoordinationNotification[]): CoordinationNotification[] {
  return [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id.localeCompare(a.id));
}

/** Idempotent merge by notification id. Read rows drop out; unread rows replace in place. */
export function mergeCoordinationNotifications(
  current: CoordinationNotification[],
  incoming: CoordinationNotification | CoordinationNotification[]
): CoordinationNotification[] {
  const next = new Map(current.map((row) => [row.id, row]));
  const rows = Array.isArray(incoming) ? incoming : [incoming];
  for (const row of rows) {
    if (row.read_at) {
      next.delete(row.id);
      continue;
    }
    next.set(row.id, row);
  }
  return sortNewestFirst([...next.values()]);
}

export function applyCoordinationRealtimeChange(
  current: CoordinationNotification[],
  payload: {
    eventType?: string;
    new?: Record<string, unknown> | null;
    old?: Record<string, unknown> | null;
  }
): CoordinationNotification[] {
  const event = String(payload.eventType ?? "").toUpperCase();
  if (event === "DELETE") {
    const id = String(payload.old?.id ?? payload.new?.id ?? "").trim();
    if (!id) return current;
    return current.filter((row) => row.id !== id);
  }

  const mapped = payload.new ? mapCoordinationNotificationRow(payload.new) : null;
  if (!mapped) return current;
  return mergeCoordinationNotifications(current, mapped);
}

export async function fetchUnreadCoordinationNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<{ notifications: CoordinationNotification[]; error: string | null }> {
  const uid = userId.trim();
  if (!uid) return { notifications: [], error: null };

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id, kind, title, body, payload, created_at, read_at")
    .eq("user_id", uid)
    .in("kind", [...COORDINATION_NOTIFICATION_KINDS])
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { notifications: [], error: readSupabaseErrorMessage(error) };
  }

  const notifications = ((data ?? []) as Record<string, unknown>[])
    .map((row) => mapCoordinationNotificationRow(row))
    .filter((row): row is CoordinationNotification => Boolean(row));

  return { notifications: sortNewestFirst(notifications), error: null };
}
