import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKINGS_TABLE,
  SITTER_FORCE_END_ADMIN_NOTE,
  type BookingRow,
  type BookingStatus
} from "@/lib/bookings/constants";

export const IN_PROGRESS_BOOKING_STATUSES: BookingStatus[] = [
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

type CompleteBookingOptions = {
  allowedStatuses?: BookingStatus[];
  markAdminReview?: boolean;
};

/** Sitter closes a live booking row — sets `completed` and records `actual_end_time`. */
export async function sitterCompleteBooking(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string,
  options: CompleteBookingOptions = {}
): Promise<{ row: BookingRow | null; error: string | null }> {
  const allowedStatuses = options.allowedStatuses ?? ["parent_started"];
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    status: "completed",
    actual_end_time: now,
    updated_at: now
  };
  if (options.markAdminReview) {
    payload.requires_admin_review = true;
    payload.admin_notes = SITTER_FORCE_END_ADMIN_NOTE;
  }

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update(payload)
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .in("status", allowedStatuses)
    .select(
      "id, parent_id, sitter_id, booking_date, start_time, end_time, status, actual_start_time, actual_end_time, requires_admin_review, admin_notes, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("requires_admin_review") ||
      msg.includes("admin_notes") ||
      msg.includes("actual_end_time") ||
      msg.includes("completed")
    ) {
      return {
        row: null,
        error: "עמודות סיום משמרת חסרות — הריצו את המיגרציות האחרונות ב-Supabase."
      };
    }
    return { row: null, error: error.message };
  }

  if (!data) {
    return {
      row: null,
      error: "לא ניתן לסיים את המשמרת — ודאו שהמשמרת במצב פעיל (הורה אישר התחלה)."
    };
  }

  return { row: data as BookingRow, error: null };
}
