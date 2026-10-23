import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAnsweredBroadcastQuestionIds } from "@/lib/broadcast/question-answer";
import { broadcastQuestionIdFromPayload, omitAnsweredBroadcastQuestions } from "@/lib/broadcast/question-link";
import {
  ORDINARY_BROADCAST_CARD_LIMIT,
  ordinaryAdminBroadcastsForReplay
} from "@/lib/broadcast/question-replay";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import {
  notificationHrefForKind,
  type CanonicalNotificationKind,
  type CanonicalNotificationPayload
} from "@/lib/notifications/kinds";
import { isOperationalCardsSuppressedRoute } from "@/lib/notifications/operational-card-routes";
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
  "manual_payment_confirmed",
  "manual_payment_denied",
  "manual_payment_resolved_reported",
  "payment_received",
  "shift_end_reminder",
  "missed_shift_clarification",
  "admin_broadcast"
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
  /** Persisted notifications.dedupe_key. Completion rows end with ":paid". */
  dedupe_key: string | null;
};

/** Suffix written by the paid-completion notification. Historical confirm rows omit it. */
export const PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX = ":paid";

export function isPaidPaymentCompletionDedupeKey(value: unknown): boolean {
  return String(value ?? "").trim().endsWith(PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX);
}

export function isPaidPaymentCompletionNotification(args: {
  kind?: string | null;
  dedupeKey?: unknown;
}): boolean {
  return String(args.kind ?? "") === "manual_payment_confirmed" && isPaidPaymentCompletionDedupeKey(args.dedupeKey);
}

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
  manual_payment_confirmed: "✅ הבייביסיטר אישרה את קבלת התשלום",
  manual_payment_denied: "התשלום לא אושר",
  manual_payment_resolved_reported: "ההורה דיווח שהתשלום הוסדר",
  payment_received: "תשלום התקבל",
  shift_end_reminder: "המשמרת מסתיימת בעוד 30 דקות",
  missed_shift_clarification: "המשמרת לא התקיימה",
  admin_broadcast: "הודעת מערכת"
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

export function operationalCardActionLabel(
  kind: GlobalOperationalNotificationKind,
  payload?: CanonicalNotificationPayload
): string {
  if (kind === "admin_broadcast") {
    if (broadcastQuestionIdFromPayload(payload)) return "למענה";
    const label = String(payload?.cta_label ?? "").trim();
    return label || "לפרטים";
  }
  if (kind === "payment_received") return "לארנק";
  if (
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
  const dedupeKey = String(row.dedupe_key ?? "").trim();
  return {
    id,
    kind: kindRaw,
    title: globalOperationalNotificationTitle(kindRaw, row.title != null ? String(row.title) : null),
    body: String(row.body ?? "").trim(),
    payload,
    created_at: String(row.created_at ?? ""),
    read_at: readAt,
    dedupe_key: dedupeKey || null
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

export const OPERATIONAL_EVENT_POPUP_DURATION_MS = 8000;
export const MAX_LIVE_OPERATIONAL_EVENT_POPUPS = 2;

export function isAdminBroadcastNotificationKind(value: string | null | undefined): boolean {
  return String(value ?? "").trim() === "admin_broadcast";
}

/** Event-time popups only — never from historical unread rows or read_at. */
export function shouldPresentOperationalEventPopup(args: {
  eventType?: string;
  pathname: string | null;
  kind?: string | null;
  dedupeKey?: unknown;
}): boolean {
  if (String(args.eventType ?? "").toUpperCase() !== "INSERT") return false;
  const kind = String(args.kind ?? "");
  if (isAdminBroadcastNotificationKind(kind)) return true;
  // Only the paid-completion row surfaces. Confirm-time rows share the kind and stay hidden.
  if (kind === "manual_payment_confirmed") {
    return isPaidPaymentCompletionDedupeKey(args.dedupeKey);
  }
  if (isOperationalCardsSuppressedRoute(args.pathname)) return false;
  return isGlobalOperationalNotificationKind(kind);
}

/** Keep every other kind, and at most the newest paid-completion card. */
export function collapsePaymentCompletionCards(
  rows: CoordinationNotification[]
): CoordinationNotification[] {
  let newest: CoordinationNotification | null = null;
  const others: CoordinationNotification[] = [];
  for (const row of rows) {
    if (row.kind !== "manual_payment_confirmed") {
      others.push(row);
      continue;
    }
    if (!isPaidPaymentCompletionDedupeKey(row.dedupe_key)) continue;
    if (
      !newest ||
      String(row.created_at).localeCompare(String(newest.created_at)) > 0 ||
      (String(row.created_at) === String(newest.created_at) && row.id.localeCompare(newest.id) > 0)
    ) {
      newest = row;
    }
  }
  return sortNewestFirst(newest ? [...others, newest] : others);
}

/**
 * Login and refresh replay. Historical confirm-time rows stay in the table and are not returned.
 * An empty result is correct while the paid-completion migration has not created any ":paid" rows.
 */
export function selectReplayablePaymentCompletionNotifications(
  rows: ReadonlyArray<Record<string, unknown>>
): CoordinationNotification[] {
  const completions = rows
    .filter((row) => row.read_at == null || row.read_at === "")
    .filter((row) =>
      isPaidPaymentCompletionNotification({
        kind: row.kind != null ? String(row.kind) : null,
        dedupeKey: row.dedupe_key
      })
    )
    .map((row) => mapCoordinationNotificationRow(row))
    .filter((row): row is CoordinationNotification => Boolean(row));
  return collapsePaymentCompletionCards(completions);
}

/** Close (X) persists read_at for this id. The auto-hide timer does not. */
export function shouldPersistOperationalCardRead(args: {
  markRead?: boolean;
  kind?: string | null;
  dedupeKey?: unknown;
}): boolean {
  if (!args.markRead) return false;
  if (isAdminBroadcastNotificationKind(args.kind)) return true;
  return isPaidPaymentCompletionNotification({ kind: args.kind, dedupeKey: args.dedupeKey });
}

export function applyOperationalEventPopupChange(
  current: CoordinationNotification[],
  payload: {
    eventType?: string;
    new?: Record<string, unknown> | null;
    old?: Record<string, unknown> | null;
  },
  pathname: string | null
): CoordinationNotification[] {
  const event = String(payload.eventType ?? "").toUpperCase();
  if (event === "DELETE") {
    const id = String(payload.old?.id ?? payload.new?.id ?? "").trim();
    if (!id) return current;
    return current.filter((row) => row.id !== id);
  }

  if (event !== "INSERT") return current;

  const kind = String(payload.new?.kind ?? "");
  const dedupeKey = payload.new?.dedupe_key;
  if (!shouldPresentOperationalEventPopup({ eventType: event, pathname, kind, dedupeKey })) {
    return current;
  }

  const mapped = payload.new ? mapCoordinationNotificationRow(payload.new) : null;
  if (!mapped) return current;
  return collapsePaymentCompletionCards(mergeCoordinationNotifications(current, mapped)).slice(
    0,
    MAX_LIVE_OPERATIONAL_EVENT_POPUPS
  );
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

export async function fetchUnreadPaymentCompletionNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<{ notifications: CoordinationNotification[]; error: string | null }> {
  const uid = userId.trim();
  if (!uid) return { notifications: [], error: null };

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id, kind, title, body, payload, created_at, read_at, dedupe_key")
    .eq("user_id", uid)
    .eq("kind", "manual_payment_confirmed")
    .like("dedupe_key", `%${PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX}`)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return { notifications: [], error: readSupabaseErrorMessage(error) };
  }

  return {
    notifications: selectReplayablePaymentCompletionNotifications((data ?? []) as Record<string, unknown>[]),
    error: null
  };
}

/**
 * Unread ordinary admin broadcasts. Interactive questions are not part of this
 * list: they stay on /broadcast/questions and must not fill these cards.
 * A failed answer lookup is reported and is not treated as "already answered".
 */
export async function fetchUnreadAdminBroadcastNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<{ notifications: CoordinationNotification[]; error: string | null; questionStatusError: string | null }> {
  const uid = userId.trim();
  if (!uid) return { notifications: [], error: null, questionStatusError: null };

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id, kind, title, body, payload, created_at, read_at")
    .eq("user_id", uid)
    .eq("kind", "admin_broadcast")
    .is("read_at", null)
    .filter("payload->>question_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(ORDINARY_BROADCAST_CARD_LIMIT);

  if (error) {
    return { notifications: [], error: readSupabaseErrorMessage(error), questionStatusError: null };
  }

  const notifications = sortNewestFirst(
    ((data ?? []) as Record<string, unknown>[])
      .map((row) => mapCoordinationNotificationRow(row))
      .filter((row): row is CoordinationNotification => Boolean(row))
  );
  const includesQuestion = notifications.some((row) => broadcastQuestionIdFromPayload(row.payload));
  const answered = includesQuestion
    ? await fetchAnsweredBroadcastQuestionIds(supabase)
    : { ids: new Set<string>(), error: null };
  const withoutAnswered = answered.error
    ? notifications.filter((row) => !broadcastQuestionIdFromPayload(row.payload))
    : omitAnsweredBroadcastQuestions(notifications, answered.ids);

  return {
    notifications: ordinaryAdminBroadcastsForReplay(withoutAnswered),
    error: null,
    questionStatusError: answered.error ? "לא הצלחנו לבדוק אם השאלה כבר נענתה." : null
  };
}
