import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

/**
 * Parent confirms sitter arrival — advances booking to `parent_started` so sitter realtime syncs.
 * Only allowed when the booking is already `sitter_started` (sitter clicked Arrived first).
 */
export async function parentApproveSitterStart(
  supabase: SupabaseClient,
  parentId: string,
  bookingId: string
): Promise<{ row: BookingRow | null; error: string | null }> {
  const now = new Date().toISOString();

  const payloads: Record<string, unknown>[] = [
    { status: "parent_started", updated_at: now },
    { status: "parent_started" }
  ];

  let lastError: string | null = null;

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from(BOOKINGS_TABLE)
      .update(payload)
      .eq("id", bookingId)
      .eq("parent_id", parentId)
      .eq("status", "sitter_started")
      .select(BOOKING_SELECT_MINIMAL)
      .maybeSingle();

    if (!error && data) {
      return { row: data as BookingRow, error: null };
    }

    if (error) {
      lastError = error.message;
    }
  }

  const { data: existing, error: readErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .eq("parent_id", parentId)
    .maybeSingle();

  if (existing && String(existing.status) === "parent_started") {
    return { row: existing as BookingRow, error: null };
  }

  if (existing && String(existing.status) !== "sitter_started") {
    return {
      row: null,
      error: "ניתן לאשר הגעה רק לאחר שהבייביסיטר סימנה שהגיעה."
    };
  }

  return {
    row: null,
    error: readErr?.message ?? lastError ?? "לא ניתן לאשר הגעה."
  };
}
