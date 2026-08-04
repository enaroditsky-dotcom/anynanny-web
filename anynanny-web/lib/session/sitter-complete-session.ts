import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

/** Sitter marks the current session complete from their side. */
export async function sitterCompleteSession(
  supabase: SupabaseClient,
  sitterId: string,
  sessionId: string | number,
  _startTime: string | null | undefined
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ status: "sitter_completed" })
    .eq("id", sessionId)
    .eq("sitter_id", sitterId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  return data ? { error: null } : { error: "לא נמצאה משמרת לסיום — ייתכן שכבר עודכנה." };
}
