import type { SupabaseClient } from "@supabase/supabase-js";
import { HOURLY_RATE, SESSIONS_TABLE } from "@/lib/session/protocol";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

function finalTotals(startTime: string | null | undefined, endIso: string) {
  const startMs = startTime ? new Date(startTime).getTime() : new Date(endIso).getTime();
  const endMs = new Date(endIso).getTime();
  const finalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  return {
    final_elapsed_seconds: finalSeconds,
    final_amount_nis: Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2))
  };
}

/** Sitter finalizes an active session — falls back to minimal columns if migrations are missing. */
export async function sitterCompleteSession(
  supabase: SupabaseClient,
  sitterId: string,
  sessionId: string | number,
  startTime: string | null | undefined
): Promise<{ error: string | null }> {
  const endIso = new Date().toISOString();
  const totals = finalTotals(startTime, endIso);

  const payloads: Record<string, unknown>[] = [
    {
      status: "completed",
      end_time: endIso,
      sitter_end_confirmed_at: endIso,
      parent_end_requested_at: null,
      ...totals
    },
    {
      status: "completed",
      end_time: endIso
    },
    {
      status: "completed"
    }
  ];

  let lastError: string | null = null;

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .update(payload)
      .eq("id", sessionId)
      .eq("sitter_id", sitterId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (!error && data) {
      return { error: null };
    }

    if (error) {
      lastError = error.message;
      const optionalColumnMissing =
        isPostgrestMissingColumnError(error.message, "sitter_end_confirmed_at") ||
        isPostgrestMissingColumnError(error.message, "parent_end_requested_at") ||
        isPostgrestMissingColumnError(error.message, "final_elapsed_seconds") ||
        isPostgrestMissingColumnError(error.message, "final_amount_nis") ||
        isPostgrestMissingColumnError(error.message, "end_time");
      if (!optionalColumnMissing) {
        return { error: error.message };
      }
    }
  }

  const { data: row } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, status")
    .eq("id", sessionId)
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (row && String(row.status) === "completed") {
    return { error: null };
  }

  return {
    error: lastError ?? "לא נמצאה משמרת פעילה לסיום — ייתכן שכבר עודכנה."
  };
}
