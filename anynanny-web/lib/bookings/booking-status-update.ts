import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";

/** Columns present on the base `bookings` table (no optional migration columns). */
export const BOOKING_SELECT_MINIMAL =
  "id, parent_id, sitter_id, booking_date, start_time, end_time, status, created_at, updated_at" as const;

const COMPLETED_BOOKING_STATUS: BookingStatus = "completed";

function isTerminalBookingStatus(status: string): boolean {
  return status === "completed" || status === "cancelled" || status === "rejected";
}

/** Close an in-progress booking using only the constrained booking `status` enum. */
export async function closeBookingForSitter(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string,
  allowedStatuses: BookingStatus[]
): Promise<{ row: BookingRow | null; error: string | null }> {
  const { data: existing, error: readErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (readErr) {
    return { row: null, error: readErr.message };
  }

  if (existing && isTerminalBookingStatus(String(existing.status))) {
    return { row: existing as BookingRow, error: null };
  }

  const { error: updateErr } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ status: COMPLETED_BOOKING_STATUS })
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .in("status", allowedStatuses);

  if (updateErr) {
    return { row: null, error: updateErr.message };
  }

  const { data: after } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (after && String(after.status) === COMPLETED_BOOKING_STATUS) {
    return { row: after as BookingRow, error: null };
  }

  return {
    row: null,
    error: "לא ניתן לסגור את המשמרת — ייתכן שהסטטוס כבר עודכן או שאינו במצב פעיל."
  };
}
