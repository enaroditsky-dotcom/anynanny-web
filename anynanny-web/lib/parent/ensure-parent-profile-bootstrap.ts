import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureProfile } from "@/lib/auth/supabase-profile";
import { resolveFullNameFromAuthUser } from "@/lib/user/greeting-display-name";

/** Ensures a parent `profiles` row exists with role and full_name when available. */
export async function ensureParentProfileBootstrap(
  supabase: SupabaseClient,
  user: User
): Promise<{ error: string | null }> {
  const fullName = resolveFullNameFromAuthUser(user);

  const ensured = await ensureProfile(supabase, {
    id: user.id,
    role: "parent",
    ...(fullName ? { full_name: fullName } : {})
  });

  return { error: ensured.error };
}
