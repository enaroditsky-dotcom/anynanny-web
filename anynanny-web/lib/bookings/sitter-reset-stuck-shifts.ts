import type { SupabaseClient } from "@supabase/supabase-js";
import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { IN_PROGRESS_BOOKING_STATUSES, sitterCompleteBooking } from "@/lib/bookings/sitter-complete-booking";
import { sitterCompleteSession } from "@/lib/session/sitter-complete-session";
import {
  SESSION_PENDING_START_STATUSES,
  SESSION_STATUS_CANCELLED,
  SESSIONS_TABLE
} from "@/lib/session/protocol";

export type ResetStuckShiftsResult = {
  sessionsCompleted: number;
  sessionsCancelled: number;
  bookingsCompleted: number;
  error: string | null;
};

/**
 * Dev/safety: close every open session + today's in-progress booking for this sitter.
 */
export async function resetStuckShiftsForSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<ResetStuckShiftsResult> {
  let sessionsCompleted = 0;
  let sessionsCancelled = 0;
  let bookingsCompleted = 0;

  const { data: activeSessions, error: activeErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, start_time")
    .eq("sitter_id", sitterId)
    .eq("status", "active");

  if (activeErr) {
    return { sessionsCompleted: 0, sessionsCancelled: 0, bookingsCompleted: 0, error: activeErr.message };
  }

  for (const row of activeSessions ?? []) {
    const { error } = await sitterCompleteSession(
      supabase,
      sitterId,
      row.id as string | number,
      (row as { start_time?: string | null }).start_time
    );
    if (error) {
      return { sessionsCompleted, sessionsCancelled, bookingsCompleted, error };
    }
    sessionsCompleted += 1;
  }

  const { data: pendingSessions, error: pendingErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq("sitter_id", sitterId)
    .in("status", [...SESSION_PENDING_START_STATUSES]);

  if (pendingErr) {
    return { sessionsCompleted, sessionsCancelled, bookingsCompleted, error: pendingErr.message };
  }

  if ((pendingSessions ?? []).length > 0) {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: SESSION_STATUS_CANCELLED })
      .eq("sitter_id", sitterId)
      .in("status", [...SESSION_PENDING_START_STATUSES]);

    if (error) {
      return { sessionsCompleted, sessionsCancelled, bookingsCompleted, error: error.message };
    }
    sessionsCancelled = pendingSessions?.length ?? 0;
  }

  const today = todayDateISO();
  const { data: openBookings, error: bookingsErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id")
    .eq("sitter_id", sitterId)
    .eq("booking_date", today)
    .in("status", IN_PROGRESS_BOOKING_STATUSES);

  if (bookingsErr) {
    return { sessionsCompleted, sessionsCancelled, bookingsCompleted, error: bookingsErr.message };
  }

  for (const row of openBookings ?? []) {
    const { error } = await sitterCompleteBooking(supabase, sitterId, String(row.id), {
      allowedStatuses: IN_PROGRESS_BOOKING_STATUSES,
      markAdminReview: true
    });
    if (error) {
      return { sessionsCompleted, sessionsCancelled, bookingsCompleted, error };
    }
    bookingsCompleted += 1;
  }

  return { sessionsCompleted, sessionsCancelled, bookingsCompleted, error: null };
}
