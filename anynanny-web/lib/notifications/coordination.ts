import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import {
  notificationHrefForKind,
  type CanonicalNotificationKind,
  type CanonicalNotificationPayload
} from "@/lib/notifications/kinds";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

/** Booking/cancellation coordination events. */
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

/** Written operational kinds shown on the same global card host. */
export const OPERATIONAL_CARD_NOTIFICATION_KINDS = [
  "manual_payment_reported",
  "manual_payment_confirmed",
  "manual_payment_denied",
  "manual_payment_resolved_reported",
  "payment_required",
  "payment_received",
  "shift_end_reminder",
  "missed_shift_clarification"
] as const satisfies readonly CanonicalNotificationKind[];

export const GLOBAL_OPERATIONAL_NOTIFICATION_KINDS = [
  ...COORDINATION_NOTIFICATION_KINDS,
  ...OPERATIONAL_CARD_NOTIFICATION_KINDS
] as const satisfies readonly CanonicalNotificationKind[];

export type CoordinationNotificationKind = (typeof COORDINATION_NOTIFICATION_KINDS)[number];
export type OperationalCardNotificationKind = (typeof OPERATIONAL_CARD_NOTIFICATION_KINDS)[number];
export type GlobalOperationalNotificationKind = (typeof GLOBAL_OPERATIONAL_NOTIFICATION_KINDS)[number];

export type CoordinationNotification = {
  id: string;
  kind: GlobalOperationalNotificationKind;
  title: string;
  body: string;
  payload: CanonicalNotificationPayload;
  created_at: string;
  read_at: string | null;
};

const COORDINATION_KIND_SET = new Set<string>(COORDINATION_NOTIFICATION_KINDS);
const GLOBAL_OPERATIONAL_KIND_SET = new Set<string>(GLOBAL_OPERATIONAL_NOTIFICATION_KINDS);

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

const OPERATIONAL_FALLBACK_TITLE: Record<OperationalCardNotificationKind, string> = {
  manual_payment_reported: "ההורה דיווח שהתשלום בוצע",
  manual_payment_confirmed: "קבלת התשלום אושרה",
  manual_payment_denied: "התשלום לא אושר",
  manual_payment_resolved_reported: "ההורה דיווח שהתשלום הוסדר",
  payment_required: "נדרש תשלום",
  payment_received: "תשלום התקבל",
  shift_end_reminder: "המשמרת מסתיימת בעוד 30 דקות",
  missed_shift_clarification: "המשמרת לא התקיימה"
};

export function isCoordinationNotificationKind(value: string): value is CoordinationNotificationKind {
  return COORDINATION_KIND_SET.has(value);
}

export function isOperationalCardNotificationKind(value: string): value is OperationalCardNotificationKind {
  return (OPERATIONAL_CARD_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function isGlobalOperationalNotificationKind(
  value: string
): value is GlobalOperationalNotificationKind {
  return GLOBAL_OPERATIONAL_KIND_SET.has(value);
}

export function coordinationNotificationTitle(
  kind: CoordinationNotificationKind,
  fallbackTitle?: string | null
): string {
  return COORDINATION_TITLE[kind] || String(fallbackTitle ?? "").trim() || "עדכון תיאום משמרת";
}

export function globalOperationalNotificationTitle(
  kind: GlobalOperationalNotificationKind,
  fallbackTitle?: string | null
): string {
  if (isCoordinationNotificationKind(kind)) {
    return coordinationNotificationTitle(kind, fallbackTitle);
  }
  const fromRow = String(fallbackTitle ?? "").trim();
  if (fromRow) return fromRow;
  if (isOperationalCardNotificationKind(kind)) return OPERATIONAL_FALLBACK_TITLE[kind];
  return "עדכון";
}

export function operationalCardActionLabel(kind: GlobalOperationalNotificationKind): string {
  if (kind === "payment_received") return "לארנק";
  if (kind === "payment_required") return "לתשלום";
  if (
    kind === "manual_payment_reported" ||
    kind === "manual_payment_confirmed" ||
    kind === "manual_payment_denied" ||
    kind === "manual_payment_resolved_reported"
  ) {
    return "לפרטים";
  }
  return "למשמרת";
}

export function coordinationBookingHref(
  kind: GlobalOperationalNotificationKind,
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
  if (!id || !isGlobalOperationalNotificationKind(kindRaw)) return null;
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as CanonicalNotificationPayload)
      : {};
  const readAt = row.read_at == null || row.read_at === "" ? null : String(row.read_at);
  return {
    id,
    kind: kindRaw,
    title: globalOperationalNotificationTitle(kindRaw, row.title != null ? String(row.title) : null),
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
    .in("kind", [...GLOBAL_OPERATIONAL_NOTIFICATION_KINDS])
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
