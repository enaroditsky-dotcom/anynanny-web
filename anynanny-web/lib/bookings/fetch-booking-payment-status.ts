import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";

export type BookingPaymentStatus = "unknown" | "unpaid" | "paid";

/**
 * Payment columns (`payment_status`, `paid_at`) are optional — production may lack them.
 * Uses only `id` so client never 400s on optional payment columns.
 */
export async function fetchBookingPaymentStatus(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingPaymentStatus> {
  const id = bookingId.trim();
  if (!id) return "unknown";

  const base = safeSupabaseRead(
    await supabase.from(BOOKINGS_TABLE).select("id").eq("id", id).maybeSingle(),
    "booking payment id probe"
  );

  if (base.error || !base.data) {
    return "unknown";
  }

  return "unpaid";
}
