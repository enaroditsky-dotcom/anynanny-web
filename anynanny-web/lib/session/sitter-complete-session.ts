import type { SupabaseClient } from "@supabase/supabase-js";
import { HOURLY_RATE, SESSIONS_TABLE } from "@/lib/session/protocol";

function finalTotals(startTime: string | null | undefined, endIso: string) {
  const startMs = startTime ? new Date(startTime).getTime() : new Date(endIso).getTime();
  const endMs = new Date(endIso).getTime();
  const finalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  return {
    final_elapsed_seconds: finalSeconds,
    final_amount_nis: Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2))
  };
}

/** Sitter finalizes an active session (with or without prior parent end request). */
export async function sitterCompleteSession(
  supabase: SupabaseClient,
  sitterId: string,
  sessionId: string | number,
  startTime: string | null | undefined
): Promise<{ error: string | null }> {
  const endIso = new Date().toISOString();
  const totals = finalTotals(startTime, endIso);

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({
      status: "completed",
      end_time: endIso,
      sitter_end_confirmed_at: endIso,
      parent_end_requested_at: null,
      ...totals
    })
    .eq("id", sessionId)
    .eq("sitter_id", sitterId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "לא נמצאה משמרת פעילה לסיום — ייתכן שכבר עודכנה." };
  }
  return { error: null };
}
