import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export async function ensureProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  input: { id: string; role: ProfileRole; full_name?: string | null }
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase.from(PROFILES_TABLE).select("id").eq("id", input.id).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { role: input.role };
    if (input.full_name !== undefined) patch.full_name = input.full_name;
    const { error } = await supabase.from(PROFILES_TABLE).update(patch).eq("id", input.id);
    if (error) return { error: error.message };
    return { error: null };
  }
  const withRoleSelected = {
    id: input.id,
    role: input.role,
    full_name: input.full_name ?? null,
    balance: 0,
    role_selected: false
  };
  let { error } = await supabase.from(PROFILES_TABLE).insert(withRoleSelected);
  if (error && isPostgrestMissingColumnError(error.message, "role_selected")) {
    ({ error } = await supabase.from(PROFILES_TABLE).insert({
      id: withRoleSelected.id,
      role: withRoleSelected.role,
      full_name: withRoleSelected.full_name,
      balance: withRoleSelected.balance
    }));
  }
  if (error) return { error: error.message };
  return { error: null };
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
    const r = await ensureProfile(supabase, { id: user.id, role: meta, full_name: fn });
    if (r.error) console.warn("[auth] ensureProfile:", r.error);
    return meta;
  }

  if (signupRole) {
    const r = await ensureProfile(supabase, {
      id: user.id,
      role: signupRole,
      full_name: signupFullName !== undefined ? signupFullName : undefined
    });
    if (r.error) console.warn("[auth] ensureProfile:", r.error);
    return signupRole;
  }

  const r = await ensureProfile(supabase, { id: user.id, role: "parent" });
  if (r.error) console.warn("[auth] ensureProfile:", r.error);
  return "parent";
}
