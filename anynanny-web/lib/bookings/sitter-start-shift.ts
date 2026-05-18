import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

export async function sitterStartShift(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({
      status: "sitter_started",
      actual_start_time: now,
      updated_at: now
    })
    .eq("id", bookingId)
    .eq("status", "approved")
    .select(
      "id, parent_id, sitter_id, booking_date, start_time, end_time, status, actual_start_time, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("sitter_started") || msg.includes("actual_start_time")) {
      return {
        row: null,
        error: "עמודות המשמרת עדיין לא עודכנו ב-Supabase — הריצו את המיגרציה האחרונה."
      };
    }
    return { row: null, error: error.message };
  }

  if (!data) {
    return { row: null, error: "לא ניתן להתחיל משמרת — ייתכן שכבר עודכנה." };
  }

  return { row: data as BookingRow, error: null };
}
