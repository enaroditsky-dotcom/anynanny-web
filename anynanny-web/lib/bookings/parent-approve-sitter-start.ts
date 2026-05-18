import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

/** Parent confirms sitter arrival — booking moves to `parent_started`. */
export async function parentApproveSitterStart(
  supabase: SupabaseClient,
  parentId: string,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ status: "parent_started", updated_at: now })
    .eq("id", bookingId)
    .eq("parent_id", parentId)
    .eq("status", "sitter_started")
    .select(
      "id, parent_id, sitter_id, booking_date, start_time, end_time, status, actual_start_time, actual_end_time, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("parent_started") || msg.includes("bookings_status_check")) {
      return {
        row: null,
        error: "סטטוס parent_started חסר — הריצו את המיגרציה 20260516260000_bookings_sitter_ended ב-Supabase."
      };
    }
    return { row: null, error: error.message };
  }

  if (!data) {
    return { row: null, error: null };
  }

  return { row: data as BookingRow, error: null };
}
