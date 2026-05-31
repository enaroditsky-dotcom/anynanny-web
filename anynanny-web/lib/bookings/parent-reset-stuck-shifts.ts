import type { SupabaseClient } from "@supabase/supabase-js";
import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { closeBookingForSitter } from "@/lib/bookings/booking-status-update";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { IN_PROGRESS_BOOKING_STATUSES } from "@/lib/bookings/sitter-complete-booking";
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
 * Rescue: close open sessions + today's in-progress bookings for a parent (status-only writes).
 */
export async function resetStuckShiftsForParent(
  supabase: SupabaseClient,
  parentId: string
): Promise<ResetStuckShiftsResult> {
  let sessionsCompleted = 0;
  let sessionsCancelled = 0;
  let bookingsCompleted = 0;
  const warnings: string[] = [];

  const { data: activeSessions, error: activeErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, start_time, sitter_id")
    .eq("parent_id", parentId)
    .eq("status", "active");

  if (activeErr) {
    warnings.push(activeErr.message);
  } else {
    for (const row of activeSessions ?? []) {
      const sitterId = row.sitter_id != null ? String(row.sitter_id) : "";
      if (sitterId) {
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
      } else {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from(SESSIONS_TABLE)
          .update({ status: "completed", end_time: now })
          .eq("id", row.id)
          .eq("parent_id", parentId);
        if (error) warnings.push(error.message);
        else sessionsCompleted += 1;
      }
    }
  }

  const { data: pendingSessions, error: pendingErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq("parent_id", parentId)
    .in("status", [...SESSION_PENDING_START_STATUSES]);

  if (pendingErr) {
    warnings.push(pendingErr.message);
  } else if ((pendingSessions ?? []).length > 0) {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: SESSION_STATUS_CANCELLED })
      .eq("parent_id", parentId)
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
    .select("id, sitter_id")
    .eq("parent_id", parentId)
    .eq("booking_date", today)
    .in("status", IN_PROGRESS_BOOKING_STATUSES);

  if (bookingsErr) {
    warnings.push(bookingsErr.message);
  } else {
    for (const row of openBookings ?? []) {
      const sitterId = row.sitter_id != null ? String(row.sitter_id) : "";
      if (!sitterId) continue;
      const { error } = await closeBookingForSitter(
        supabase,
        sitterId,
        String(row.id),
        IN_PROGRESS_BOOKING_STATUSES
      );
      if (error) {
        warnings.push(error);
      } else {
        bookingsCompleted += 1;
      }
    }
  }

  if (warnings.length > 0) {
    console.warn("[resetStuckShiftsForParent]", warnings.join(" | "));
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
