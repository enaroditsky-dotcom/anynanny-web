import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export async function ensureProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  input: { id: string; role: ProfileRole; full_name?: string | null }
) {
  const { data: existing } = await supabase.from(PROFILES_TABLE).select("id").eq("id", input.id).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { role: input.role };
    if (input.full_name !== undefined) patch.full_name = input.full_name;
    const { error } = await supabase.from(PROFILES_TABLE).update(patch).eq("id", input.id);
    if (error) console.warn("[auth] profiles update:", error.message);
    return;
  }
  const { error } = await supabase.from(PROFILES_TABLE).insert({
    id: input.id,
    role: input.role,
    full_name: input.full_name ?? null,
    balance: 0
  });
  if (error) console.warn("[auth] profiles insert:", error.message);
}

/** Prefer DB profile, then auth metadata, then signup-time role/name, then parent default. */
export async function resolveRoleForUser(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  user: { id: string; user_metadata?: Record<string, unknown> },
  signupRole?: ProfileRole,
  signupFullName?: string | null
): Promise<ProfileRole> {
  const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
  if (profile?.role && isProfileRole(profile.role)) {
    return profile.role;
  }

  const meta = user.user_metadata?.role;
  if (typeof meta === "string" && isProfileRole(meta)) {
    const fn =
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() || null : undefined;
    await ensureProfile(supabase, { id: user.id, role: meta, full_name: fn });
    return meta;
  }

  if (signupRole) {
    await ensureProfile(supabase, {
      id: user.id,
      role: signupRole,
      full_name: signupFullName !== undefined ? signupFullName : undefined
    });
    return signupRole;
  }

  await ensureProfile(supabase, { id: user.id, role: "parent" });
  return "parent";
}
