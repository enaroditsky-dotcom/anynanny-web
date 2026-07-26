import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

export async function sitterStartShift(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const now = new Date().toISOString();

  const payloads: Record<string, unknown>[] = [
    { status: "sitter_started", actual_start_time: now, updated_at: now },
    { status: "sitter_started", updated_at: now },
    { status: "sitter_started" }
  ];

  let lastError: string | null = null;

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from(BOOKINGS_TABLE)
      .update(payload)
      .eq("id", bookingId)
      .in("status", ["approved"])
      .select(BOOKING_SELECT_MINIMAL)
      .maybeSingle();

    if (!error && data) {
      return { row: data as BookingRow, error: null };
    }
    if (error) {
      lastError = error.message;
    }
  }

  // Fallback try without status restriction if status was slightly different
  for (const payload of payloads) {
    const { data, error } = await supabase
      .from(BOOKINGS_TABLE)
      .update(payload)
      .eq("id", bookingId)
      .select(BOOKING_SELECT_MINIMAL)
      .maybeSingle();

    if (!error && data) {
      return { row: data as BookingRow, error: null };
    }
    if (error) {
      lastError = error.message;
    }
  }

  return {
    row: null,
    error: lastError ?? "לא ניתן להתחיל משמרת — ייתכן שכבר עודכנה."
  };
}