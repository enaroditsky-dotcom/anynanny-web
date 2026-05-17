import type { SupabaseClient } from "@supabase/supabase-js";

/** Calls `delete_current_user` RPC (must exist in Supabase). */
export async function deleteCurrentUserAccount(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc("delete_current_user");
  if (error) {
    return { ok: false, message: error.message || "מחיקת החשבון נכשלה." };
  }
  return { ok: true };
}
