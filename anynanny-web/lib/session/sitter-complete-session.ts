import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

const ALREADY_TERMINAL = new Set([
  "sitter_completed",
  "payment_pending",
  "paid",
  "completed"
]);

/** Sitter marks the current session complete from their side. Idempotent for terminal rows. */
export async function sitterCompleteSession(
  supabase: SupabaseClient,
  sitterId: string,
  sessionId: string | number,
  _startTime: string | null | undefined
): Promise<{ error: string | null }> {
  const { data: current, error: readErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, status")
    .eq("id", sessionId)
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (readErr) {
    return { error: readErr.message };
  }
  if (!current?.id) {
    return { error: "לא נמצאה משמרת לסיום — ייתכן שכבר עודכנה." };
  }
  if (ALREADY_TERMINAL.has(String(current.status))) {
    return { error: null };
  }

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
