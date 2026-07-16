import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureProfile } from "@/lib/auth/supabase-profile";
import { resolveNamePartsFromAuthUser } from "@/lib/user/greeting-display-name";

/** Ensures a parent `profiles` row exists with role and name parts when available. */
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
