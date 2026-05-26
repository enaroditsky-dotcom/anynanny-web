import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

export async function cancelSitterUpcomingShift(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  const { data: bookingRow, error: bookingError } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ status: "cancelled", updated_at: now })
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .select("id")
    .maybeSingle();

  if (bookingError) {
    return { ok: false, error: bookingError.message };
  }

  if (!bookingRow) {
    return { ok: false, error: "לא נמצאה משמרת לביטול." };
  }

  const { error: sessionStatusError } = await supabase
    .from(SESSIONS_TABLE)
    .update({ status: "cancelled", session_status: "cancelled" })
    .eq("booking_id", bookingId)
    .eq("sitter_id", sitterId);

  if (sessionStatusError) {
    const { error: sessionFallbackError } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: "cancelled" })
      .eq("booking_id", bookingId)
      .eq("sitter_id", sitterId);

    if (sessionFallbackError) {
      console.warn("[cancel-sitter-shift] session update:", sessionFallbackError.message);
    }
  }

  return { ok: true };
}
