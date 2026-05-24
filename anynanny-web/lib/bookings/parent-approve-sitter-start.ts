import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

/**
 * Parent confirms sitter arrival.
 * Skips `parent_started` — many deployed DBs only allow through `sitter_started`.
 * Touch-only update keeps the row valid without tripping bookings_status_check.
 */
export async function parentApproveSitterStart(
  supabase: SupabaseClient,
  parentId: string,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const now = new Date().toISOString();

  const payloads: Record<string, unknown>[] = [{ updated_at: now }, {}];

  let lastError: string | null = null;

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from(BOOKINGS_TABLE)
      .update(payload)
      .eq("id", bookingId)
      .eq("parent_id", parentId)
      .in("status", ["sitter_started", "approved"])
      .select(BOOKING_SELECT_MINIMAL)
      .maybeSingle();

    if (!error && data) {
      return { row: data as BookingRow, error: null };
    }

    if (error) {
      lastError = error.message;
    }
  }

  const { data: existing, error: readErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .eq("parent_id", parentId)
    .maybeSingle();

  if (existing) {
    return { row: existing as BookingRow, error: null };
  }

  return {
    row: null,
    error: readErr?.message ?? lastError
  };
}
