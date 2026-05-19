import type { SupabaseClient } from "@supabase/supabase-js";
import { closeBookingForSitter } from "@/lib/bookings/booking-status-update";
import { completeActiveSessionForBookingPartners } from "@/lib/bookings/complete-linked-session";
import type { BookingRow } from "@/lib/bookings/constants";

export async function sitterForceEndBooking(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const { row, error } = await closeBookingForSitter(supabase, sitterId, bookingId, [
    "sitter_ended",
    "parent_started"
  ]);

  if (error || !row) {
    return { row: null, error };
  }

  await completeActiveSessionForBookingPartners(supabase, sitterId, row.parent_id);

  return { row, error: null };
}
