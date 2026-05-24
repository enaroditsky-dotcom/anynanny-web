import type { SupabaseClient } from "@supabase/supabase-js";
import { sitterCompleteSession } from "@/lib/session/sitter-complete-session";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

/** Close an orphaned `sessions` row when the linked booking was finalized early. */
export async function completeActiveSessionForBookingPartners(
  supabase: SupabaseClient,
  sitterId: string,
  parentId: string
): Promise<void> {
  const { data: session } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, start_time")
    .eq("sitter_id", sitterId)
    .eq("parent_id", parentId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return;

  const sessionId = session.id;
  const startTime =
    typeof session.start_time === "string" ? session.start_time : null;

  await sitterCompleteSession(supabase, sitterId, sessionId, startTime);
}
