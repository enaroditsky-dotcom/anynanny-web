import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import { validateShiftWindow } from "@/lib/shift-requests/create-shift-request";

export { validateShiftWindow };
export {
  PARENT_SEARCH_HOUR_OPTIONS,
  PARENT_SEARCH_MINUTE_OPTIONS,
  type ParentSearchMinute
} from "@/lib/shift-requests/create-shift-request";

export async function createBooking(
  supabase: SupabaseClient,
  parentId: string,
  input: {
    sitterId: string;
    /** Calendar start day of the shift (`bookings.booking_date`). */
    bookingDate: string;
    /** Calendar end day (stored on `end_time` timestamptz; same column when same day). */
    endBookingDate: string;
    startIso: string;
    endIso: string;
  }
): Promise<{ booking: BookingRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .insert({
      parent_id: parentId,
      sitter_id: input.sitterId,
      booking_date: input.bookingDate,
      start_time: input.startIso,
      end_time: input.endIso,
      status: "pending"
    })
    .select("id, parent_id, sitter_id, booking_date, start_time, end_time, status, created_at, updated_at")
    .single();

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("row-level security") || m.includes("policy")) {
      return { booking: null, error: "אין הרשאה לשלוח בקשה. ודאו שהתחברתם כהורה." };
    }
    if (m.includes("bookings") && m.includes("schema cache")) {
      return { booking: null, error: "טבלת bookings עדיין לא זמינה — הריצו את המיגרציה ב-Supabase." };
    }
    return { booking: null, error: error.message };
  }

  return { booking: data as BookingRow, error: null };
}
