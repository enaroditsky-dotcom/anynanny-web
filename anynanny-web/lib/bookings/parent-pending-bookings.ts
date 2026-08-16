import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { PARENT_PENDING_SITTER_APPROVAL_STATUS } from "@/lib/bookings/calendar-shift-filters";

/** Count of this parent's booking requests still waiting for sitter approval (`pending`). */
export async function fetchParentPendingSitterApprovalCount(
  supabase: SupabaseClient,
  parentId: string
): Promise<number> {
  const { count, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("parent_id", parentId)
    .eq("status", PARENT_PENDING_SITTER_APPROVAL_STATUS);

  if (error) {
    console.warn("[parent pending bookings] count:", error.message);
    return 0;
  }

  return count ?? 0;
}
