import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";

const RESPONSE_STATUSES: BookingStatus[] = ["approved", "rejected"];
const LOCAL_ACK_STORAGE_KEY = "parent_booking_response_ack_v1";

export type ParentBookingResponseNotification = Pick<
  BookingRow,
  "id" | "booking_date" | "start_time" | "end_time" | "status" | "updated_at"
>;

function readLocallyAcknowledgedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_ACK_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

export function persistLocalParentBookingResponseAck(bookingId: string): void {
  if (!bookingId.trim() || typeof window === "undefined") return;
  try {
    const next = readLocallyAcknowledgedIds();
    next.add(bookingId);
    localStorage.setItem(LOCAL_ACK_STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
}

export function formatParentBookingResponseDate(bookingDate: string): string {
  const day = (bookingDate || "").trim();
  if (!day) return "התאריך שנבחר";
  return new Date(`${day}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function parentBookingResponseMessage(
  notification: ParentBookingResponseNotification
): { title: string; body: string; variant: "success" | "rejected" } {
  const dateLabel = formatParentBookingResponseDate(notification.booking_date);
  if (notification.status === "approved") {
    return {
      variant: "success",
      title: "המשמרת אושרה!",
      body: `הבייביסיטר אישרה את המשמרת בתאריך ${dateLabel}!`
    };
  }
  return {
    variant: "rejected",
    title: "הבקשה נדחתה",
    body: `הבייביסיטר דחתה את הבקשה למשמרת בתאריך ${dateLabel}.`
  };
}

function filterUnacknowledgedRows(
  rows: ParentBookingResponseNotification[]
): ParentBookingResponseNotification[] {
  const localAck = readLocallyAcknowledgedIds();
  return rows.filter((row) => !localAck.has(row.id));
}

export async function fetchUnacknowledgedParentBookingResponses(
  supabase: SupabaseClient,
  parentId: string
): Promise<{ notifications: ParentBookingResponseNotification[]; error: string | null }> {
  // Live DB does not have `parent_notified_at` — use base columns + localStorage ack only.
  const result = safeSupabaseRead(
    await supabase
      .from(BOOKINGS_TABLE)
      .select("id, booking_date, start_time, end_time, status, updated_at")
      .eq("parent_id", parentId)
      .in("status", RESPONSE_STATUSES)
      .order("updated_at", { ascending: false }),
    "parent booking response notifications"
  );

  if (result.error || !result.data) {
    return { notifications: [], error: result.error };
  }

  return {
    notifications: filterUnacknowledgedRows(result.data as ParentBookingResponseNotification[]),
    error: null
  };
}

export async function acknowledgeParentBookingResponse(
  _supabase: SupabaseClient,
  _parentId: string,
  bookingId: string
): Promise<{ ok: boolean; error: string | null }> {
  persistLocalParentBookingResponseAck(bookingId);

  // Ack is local-only: `bookings.parent_notified_at` is not present in production.
  return { ok: true, error: null };
}
