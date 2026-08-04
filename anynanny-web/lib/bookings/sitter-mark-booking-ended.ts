import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

/** Only values allowed by `bookings_status_check` — invalid enums cause PostgREST 400. */
const LIVE_TO_ENDED_STATUSES = [
  "parent_started",
  "sitter_started"
] as const;

/**
 * Sitter requested end from the session protocol path — mirror onto the booking
 * so the parent dashboard realtime subscription sees `sitter_ended` immediately.
 */
export async function sitterMarkBookingEnded(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ status: "sitter_ended", updated_at: now })
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .in("status", [...LIVE_TO_ENDED_STATUSES])
    .select(BOOKING_SELECT_MINIMAL)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }

  if (data) {
    return { row: data as BookingRow, error: null };
  }

  const { data: existing } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (existing && String(existing.status) === "sitter_ended") {
    return { row: existing as BookingRow, error: null };
  }

  return { row: null, error: null };
}
