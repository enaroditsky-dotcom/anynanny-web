import type { SupabaseClient } from "@supabase/supabase-js";
import { removeAuthenticatedUserAvatars } from "@/lib/profile/avatar-storage";

/** Calls `delete_current_user` RPC (must exist in Supabase). */
export async function deleteCurrentUserAccount(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cleanup = await removeAuthenticatedUserAvatars(supabase);
  if (cleanup.error) {
    console.warn("[delete-account] avatar cleanup skipped:", cleanup.error);
  }

  const { error } = await supabase.rpc("delete_current_user");
  if (error) {
    return { ok: false, message: error.message || "מחיקת החשבון נכשלה." };
  }
  return { ok: true };
}
