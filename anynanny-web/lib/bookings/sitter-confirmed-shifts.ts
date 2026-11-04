import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCancellationColumnMissing,
  withCancellationSelect
} from "@/lib/bookings/cancellation-request";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import {
  bookingPartnerDisplayName,
  fetchBookingPartnerDisplays
} from "@/lib/profile/booking-partner-access";

export type ConfirmedShiftView = BookingRow & {
  parent_full_name: string | null;
  schedule_label: string;
};

export async function fetchConfirmedShiftsForSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ shifts: ConfirmedShiftView[]; error: string | null }> {
  const selectWithCancellation = withCancellationSelect(
    "id, parent_id, sitter_id, booking_date, start_time, end_time, status, payment_status, actual_start_time, created_at, updated_at"
  );
  const selectFull =
    "id, parent_id, sitter_id, booking_date, start_time, end_time, status, actual_start_time, created_at, updated_at";
  const selectCore =
    "id, parent_id, sitter_id, booking_date, start_time, end_time, status, created_at, updated_at";

  let rows: BookingRow[] | null = null;
  let errorMessage: string | null = null;

  const cancellationQuery = await supabase
    .from(BOOKINGS_TABLE)
    .select(selectWithCancellation)
    .eq("sitter_id", sitterId)
    .in("status", ["approved", "sitter_started", "parent_started", "sitter_ended"])
    .order("start_time", { ascending: true });

  if (!cancellationQuery.error) {
    rows = (cancellationQuery.data as unknown as BookingRow[] | null) ?? [];
  } else if (isCancellationColumnMissing(cancellationQuery.error.message)) {
    const full = await supabase
      .from(BOOKINGS_TABLE)
      .select(selectFull)
      .eq("sitter_id", sitterId)
      .in("status", ["approved", "sitter_started", "parent_started", "sitter_ended"])
      .order("start_time", { ascending: true });

    if (full.error) {
      errorMessage = full.error.message;
      const core = await supabase
        .from(BOOKINGS_TABLE)
        .select(selectCore)
        .eq("sitter_id", sitterId)
        .in("status", ["approved", "sitter_started", "parent_started", "sitter_ended"])
        .order("start_time", { ascending: true });
      if (core.error) {
        return { shifts: [], error: core.error.message };
      }
      rows = (core.data as BookingRow[] | null) ?? [];
      errorMessage = null;
    } else {
      rows = (full.data as BookingRow[] | null) ?? [];
    }
  } else {
    return { shifts: [], error: cancellationQuery.error.message };
  }

  const bookings = rows ?? [];
  if (bookings.length === 0) {
    return { shifts: [], error: errorMessage };
  }

  const parentIds = [...new Set(bookings.map((b) => b.parent_id))];
  const profiles = await fetchBookingPartnerDisplays(supabase, parentIds);
  const nameByParentId = new Map<string, string>();
  for (const [id, profile] of profiles) {
    const name = bookingPartnerDisplayName(profile);
    if (name) nameByParentId.set(id, name);
  }

  return {
    shifts: bookings.map((b) => ({
      ...b,
      parent_full_name: nameByParentId.get(b.parent_id) ?? null,
      schedule_label: formatBookingSchedule(b)
    })),
    error: null
  };
}
