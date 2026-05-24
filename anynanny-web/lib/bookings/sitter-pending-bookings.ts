import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export type PendingBookingView = BookingRow & {
  parent_full_name: string | null;
};

export function formatBookingSchedule(booking: Pick<PendingBookingView, "booking_date" | "start_time" | "end_time">): string {
  const dayLabel = new Date(`${booking.booking_date}T12:00:00`).toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
  const startLabel = new Date(booking.start_time).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit"
  });
  const endLabel = new Date(booking.end_time).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${dayLabel} · ${startLabel}–${endLabel}`;
}

export async function fetchPendingBookingsForSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ bookings: PendingBookingView[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, sitter_id, booking_date, start_time, end_time, status, created_at, updated_at")
    .eq("sitter_id", sitterId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return { bookings: [], error: error.message };
  }

  const bookings = (rows ?? []) as BookingRow[];
  if (bookings.length === 0) {
    return { bookings: [], error: null };
  }

  const parentIds = [...new Set(bookings.map((b) => b.parent_id))];
  const { data: profiles, error: profileError } = await supabase
    .from(PROFILES_TABLE)
    .select("id, full_name")
    .in("id", parentIds);

  if (profileError) {
    console.warn("[sitter bookings] parent profiles:", profileError.message);
  }

  const nameByParentId = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p && typeof p === "object" && "id" in p) {
      const id = String((p as { id: string }).id);
      const name = String((p as { full_name?: string }).full_name ?? "").trim();
      if (name) nameByParentId.set(id, name);
    }
  }

  return {
    bookings: bookings.map((b) => ({
      ...b,
      parent_full_name: nameByParentId.get(b.parent_id) ?? null
    })),
    error: null
  };
}

export async function updateBookingStatus(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string,
  status: Extract<BookingStatus, "approved" | "rejected">
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    return { error: error.message };
  }

  if (!data?.length) {
    return { error: "הבקשה כבר טופלה או שאינה זמינה" };
  }

  return { error: null };
}
