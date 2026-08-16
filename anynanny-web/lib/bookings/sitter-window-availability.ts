import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

/**
 * Server-side availability for a requested window.
 * Same conflict rules as {@link sitterHasOverlappingActiveShift} / `sitter_window_is_available`.
 */
export async function sitterWindowIsAvailable(
  supabase: SupabaseClient,
  sitterId: string,
  startIso: string,
  endIso: string
): Promise<{ available: boolean | null; usedRpc: boolean; error: string | null }> {
  const id = sitterId.trim();
  if (!id || !startIso.trim() || !endIso.trim()) {
    return { available: null, usedRpc: false, error: "חסר חלון זמינות לבדיקה." };
  }

  const { data, error } = await supabase.rpc("sitter_window_is_available", {
    p_sitter_id: id,
    p_start_time: startIso,
    p_end_time: endIso
  });

  if (error) {
    return {
      available: null,
      usedRpc: false,
      error: readSupabaseErrorMessage(error)
    };
  }

  if (data === true) return { available: true, usedRpc: true, error: null };
  if (data === false) return { available: false, usedRpc: true, error: null };
  return { available: null, usedRpc: false, error: "בדיקת הזמינות החזירה ערך לא תקין." };
}
