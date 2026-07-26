import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

/** Sitter requests end while shift is live — booking moves to `sitter_ended`. */
export async function sitterRequestEndBooking(
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
    .eq("status", "parent_started")
    .select(BOOKING_SELECT_MINIMAL)
    .maybeSingle();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("sitter_ended") || msg.includes("bookings_status_check")) {
      return {
        row: null,
        error:
          "סטטוס sitter_ended חסר — הריצו את המיגרציה 20260516260000_bookings_sitter_ended ב-Supabase."
      };
    }
    return { row: null, error: error.message };
  }

  if (!data) {
    return { row: null, error: "לא ניתן לבקש סיום — ודאו שההורה אישר תחילת משמרת." };
  }

  const booking = data as BookingRow;

  // Keep session protocol in sync so parent session subscriptions also flip immediately.
  const { data: session } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq("sitter_id", sitterId)
    .eq("parent_id", booking.parent_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (session?.id) {
    await supabase
      .from(SESSIONS_TABLE)
      .update({ status: "sitter_completed" })
      .eq("id", session.id)
      .eq("sitter_id", sitterId);
  }

  return { row: booking, error: null };
}
