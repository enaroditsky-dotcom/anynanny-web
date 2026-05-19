import type { SupabaseClient } from "@supabase/supabase-js";
import { closeBookingForSitter } from "@/lib/bookings/booking-status-update";
import { completeActiveSessionForBookingPartners } from "@/lib/bookings/complete-linked-session";
import type { BookingRow, BookingStatus } from "@/lib/bookings/constants";

export const IN_PROGRESS_BOOKING_STATUSES: BookingStatus[] = [
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

type CompleteBookingOptions = {
  allowedStatuses?: BookingStatus[];
  /** @deprecated Ignored — only core columns are written. */
  markAdminReview?: boolean;
};

/** Sitter closes a live booking — status-only update (no optional DB columns). */
export async function sitterCompleteBooking(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string,
  options: CompleteBookingOptions = {}
): Promise<{ row: BookingRow | null; error: string | null }> {
  const allowedStatuses = options.allowedStatuses ?? ["parent_started"];

  const { row, error } = await closeBookingForSitter(
    supabase,
    sitterId,
    bookingId,
    allowedStatuses
  );

  if (error || !row) {
    return { row: null, error };
  }

  await completeActiveSessionForBookingPartners(supabase, sitterId, row.parent_id);

  return { row, error: null };
}
