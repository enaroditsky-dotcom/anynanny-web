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
 * Rescue: close open sessions + today's in-progress bookings using status-only writes.
 * Does not fail the whole operation on a single row — UI should always refresh after.
 */
export async function resetStuckShiftsForSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<ResetStuckShiftsResult> {
  let sessionsCompleted = 0;
  let sessionsCancelled = 0;
  let bookingsCompleted = 0;
  const warnings: string[] = [];

  const { data: activeSessions, error: activeErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, start_time")
    .eq("sitter_id", sitterId)
    .eq("status", "active");

  if (activeErr) {
    warnings.push(activeErr.message);
  } else {
    for (const row of activeSessions ?? []) {
      const { error } = await sitterCompleteSession(
        supabase,
        sitterId,
        row.id as string | number,
        (row as { start_time?: string | null }).start_time
      );
      if (error) {
        warnings.push(error);
      } else {
        sessionsCompleted += 1;
      }
    }
  }

  const { data: pendingSessions, error: pendingErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq("sitter_id", sitterId)
    .in("status", [...SESSION_PENDING_START_STATUSES]);

  if (pendingErr) {
    warnings.push(pendingErr.message);
  } else if ((pendingSessions ?? []).length > 0) {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: SESSION_STATUS_CANCELLED })
      .eq("sitter_id", sitterId)
      .in("status", [...SESSION_PENDING_START_STATUSES]);

    if (error) {
      warnings.push(error.message);
    } else {
      sessionsCancelled = pendingSessions?.length ?? 0;
    }
  }

  const today = todayDateISO();
  const { data: openBookings, error: bookingsErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id")
    .eq("sitter_id", sitterId)
    .eq("booking_date", today)
    .in("status", IN_PROGRESS_BOOKING_STATUSES);

  if (bookingsErr) {
    warnings.push(bookingsErr.message);
  } else {
    for (const row of openBookings ?? []) {
      const { error } = await sitterCompleteBooking(supabase, sitterId, String(row.id), {
        allowedStatuses: IN_PROGRESS_BOOKING_STATUSES
      });
      if (error) {
        warnings.push(error);
      } else {
        bookingsCompleted += 1;
      }
    }
  }

  if (warnings.length > 0) {
    console.warn("[resetStuckShiftsForSitter]", warnings.join(" | "));
  }

  const didWork =
    sessionsCompleted > 0 || sessionsCancelled > 0 || bookingsCompleted > 0;

  return {
    sessionsCompleted,
    sessionsCancelled,
    bookingsCompleted,
    error: didWork ? null : warnings[0] ?? null
  };
}
