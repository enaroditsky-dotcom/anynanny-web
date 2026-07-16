import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseStuckShift, type ReleaseStuckShiftResult } from "@/lib/bookings/release-stuck-shift";

export type ResetStuckShiftsResult = ReleaseStuckShiftResult & {
  /** @deprecated Use sessionsDeleted */
  sessionsCompleted: number;
  /** @deprecated Use sessionsDeleted */
  sessionsCancelled: number;
  /** @deprecated Use bookingsDeleted */
  bookingsCompleted: number;
};

/**
 * Rescue: delete open sessions + today's in-progress bookings for a parent.
 */
export async function resetStuckShiftsForParent(
  supabase: SupabaseClient,
  parentId: string
): Promise<ResetStuckShiftsResult> {
  const result = await releaseStuckShift(supabase, "parent_id", parentId);
  return {
    ...result,
    sessionsCompleted: result.sessionsDeleted,
    sessionsCancelled: 0,
    bookingsCompleted: result.bookingsDeleted
  };
}
