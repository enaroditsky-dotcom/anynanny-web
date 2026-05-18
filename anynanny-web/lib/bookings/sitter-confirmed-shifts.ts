import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export type ConfirmedShiftView = BookingRow & {
  parent_full_name: string | null;
  schedule_label: string;
};

export async function fetchConfirmedShiftsForSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ shifts: ConfirmedShiftView[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select(
      "id, parent_id, sitter_id, booking_date, start_time, end_time, status, actual_start_time, created_at, updated_at"
    )
    .eq("sitter_id", sitterId)
    .in("status", ["approved", "sitter_started"])
    .order("start_time", { ascending: true });

  if (error) {
    return { shifts: [], error: error.message };
  }

  const bookings = (rows ?? []) as BookingRow[];
  if (bookings.length === 0) {
    return { shifts: [], error: null };
  }

  const parentIds = [...new Set(bookings.map((b) => b.parent_id))];
  const { data: profiles } = await supabase.from(PROFILES_TABLE).select("id, full_name").in("id", parentIds);

  const nameByParentId = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p && typeof p === "object" && "id" in p) {
      const id = String((p as { id: string }).id);
      const name = String((p as { full_name?: string }).full_name ?? "").trim();
      if (name) nameByParentId.set(id, name);
    }
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
