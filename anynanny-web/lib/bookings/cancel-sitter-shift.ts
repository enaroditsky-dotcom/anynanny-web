import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

const IN_FLIGHT_SESSION_STATUSES = [
  "pending_sitter_approval",
  "pending",
  "pending_confirmation",
  "active"
] as const;

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
    .select("id, parent_id")
    .maybeSingle();

  if (bookingError) {
    return { ok: false, error: bookingError.message };
  }

  if (!bookingRow) {
    return { ok: false, error: "לא נמצאה משמרת לביטול." };
  }

  const parentId =
    bookingRow.parent_id != null ? String(bookingRow.parent_id).trim() : "";

  if (parentId) {
    const { error: participantError } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: "cancelled" })
      .eq("parent_id", parentId)
      .eq("sitter_id", sitterId)
      .in("status", [...IN_FLIGHT_SESSION_STATUSES]);

    if (participantError) {
      console.warn("[cancel-sitter-shift] session update:", participantError.message);
    }
  }

  return { ok: true };
}
