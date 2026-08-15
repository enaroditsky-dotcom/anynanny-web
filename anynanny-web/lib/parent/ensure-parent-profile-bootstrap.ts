import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureProfile } from "@/lib/auth/supabase-profile";
import { resolveNamePartsFromAuthUser } from "@/lib/user/greeting-display-name";

/**
 * Ensures an account-level `profiles` row exists.
 * Does not overwrite an existing product role and does not grant Parent portal access.
 */
export async function ensureParentProfileBootstrap(
  supabase: SupabaseClient,
  user: User
): Promise<{ error: string | null }> {
  const nameParts = resolveNamePartsFromAuthUser(user);

  const ensured = await ensureProfile(supabase, {
    id: user.id,
    role: "parent",
    ...nameParts
  });

  return { error: ensured.error };
}
