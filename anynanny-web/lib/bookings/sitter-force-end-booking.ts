import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKINGS_TABLE,
  SITTER_FORCE_END_ADMIN_NOTE,
  type BookingRow
} from "@/lib/bookings/constants";

export async function sitterForceEndBooking(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({
      status: "completed",
      requires_admin_review: true,
      admin_notes: SITTER_FORCE_END_ADMIN_NOTE,
      actual_end_time: now,
      updated_at: now
    })
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .eq("status", "sitter_ended")
    .select(
      "id, parent_id, sitter_id, booking_date, start_time, end_time, status, actual_start_time, actual_end_time, requires_admin_review, admin_notes, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("requires_admin_review") || msg.includes("admin_notes") || msg.includes("completed")) {
      return {
        row: null,
        error: "עמודות סיום כפוי / ביקורת מנהל חסרות — הריצו את המיגרציה האחרונה ב-Supabase."
      };
    }
    return { row: null, error: error.message };
  }

  if (!data) {
    return {
      row: null,
      error: "לא ניתן לסיים כפוי — נדרש סטטוס «סיום מבוקש» (הורה לא מגיב)."
    };
  }

  return { row: data as BookingRow, error: null };
}
