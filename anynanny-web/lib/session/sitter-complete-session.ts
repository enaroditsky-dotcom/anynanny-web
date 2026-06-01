import type { SupabaseClient } from "@supabase/supabase-js";
import { HOURLY_RATE, SESSIONS_TABLE } from "@/lib/session/protocol";
import { updateSessionReturningRow } from "@/lib/session/sessions-query";
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

function isOptionalSessionColumnError(message: string): boolean {
  return (
    isPostgrestMissingColumnError(message, "sitter_end_confirmed_at") ||
    isPostgrestMissingColumnError(message, "parent_end_requested_at") ||
    isPostgrestMissingColumnError(message, "final_elapsed_seconds") ||
    isPostgrestMissingColumnError(message, "final_amount_nis") ||
    isPostgrestMissingColumnError(message, "end_time")
  );
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
      ...totals
    },
    {
      status: "completed",
      end_time: endIso,
      sitter_end_confirmed_at: endIso
    },
    {
      status: "completed",
      end_time: endIso,
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

  const statusFilters: Array<string | undefined> = ["active", undefined];
  let lastError: string | null = null;

  for (const statusFilter of statusFilters) {
    for (const payload of payloads) {
      let request = supabase
        .from(SESSIONS_TABLE)
        .update(payload)
        .eq("id", sessionId)
        .eq("sitter_id", sitterId);
      if (statusFilter) {
        request = request.eq("status", statusFilter);
      }

      const { data, error } = await request.select("id").maybeSingle();

      if (!error && data) {
        return { error: null };
      }

      if (error) {
        lastError = error.message;
        if (!isOptionalSessionColumnError(error.message)) {
          break;
        }
      }
    }
  }

  for (const payload of payloads) {
    const updated = await updateSessionReturningRow(supabase, String(sessionId), payload);
    if (updated.row && String(updated.row.status) === "completed") {
      return { error: null };
    }
    if (updated.error && !isOptionalSessionColumnError(updated.error)) {
      lastError = updated.error;
      break;
    }
    if (updated.error) {
      lastError = updated.error;
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
