import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export type ProfileNameInput = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
};

function buildFullName(input: ProfileNameInput): string | null {
  const first = (input.first_name ?? "").trim();
  const last = (input.last_name ?? "").trim();
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  const legacy = (input.full_name ?? "").trim();
  return legacy || null;
}

export async function upsertProfileOnSignup(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  input: {
    id: string;
    role: ProfileRole;
    first_name: string;
    last_name: string;
  }
): Promise<{ error: string | null }> {
  const first_name = input.first_name.trim();
  const last_name = input.last_name.trim();

  const row: Record<string, unknown> = {
    id: input.id,
    role: input.role,
    first_name,
    last_name,
    balance: 0,
    role_selected: true
  };

  let { error } = await supabase.from(PROFILES_TABLE).upsert(row, { onConflict: "id" });

  if (error && isPostgrestMissingColumnError(error.message, "first_name")) {
    ({ error } = await supabase.from(PROFILES_TABLE).upsert(
      { id: input.id, role: input.role, balance: 0 },
      { onConflict: "id" }
    ));
  }

  if (error) return { error: error.message };
  return { error: null };
}

export async function ensureProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  input: { id: string; role: ProfileRole } & ProfileNameInput
): Promise<{ error: string | null }> {
  const full_name = buildFullName(input);

  const { data: existing } = await supabase.from(PROFILES_TABLE).select("id").eq("id", input.id).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { role: input.role };
    if (input.first_name !== undefined) patch.first_name = input.first_name?.trim() || null;
    if (input.last_name !== undefined) patch.last_name = input.last_name?.trim() || null;
    if (full_name !== null) patch.full_name = full_name;
    else if (input.full_name !== undefined) patch.full_name = input.full_name;
    const { error } = await supabase.from(PROFILES_TABLE).update(patch).eq("id", input.id);
    if (error) return { error: error.message };
    return { error: null };
  }

  const withRoleSelected: Record<string, unknown> = {
    id: input.id,
    role: input.role,
    first_name: input.first_name?.trim() || null,
    last_name: input.last_name?.trim() || null,
    full_name,
    balance: 0,
    role_selected: false
  };

  let { error } = await supabase.from(PROFILES_TABLE).insert(withRoleSelected);

  if (error && isPostgrestMissingColumnError(error.message, "role_selected")) {
    ({ error } = await supabase.from(PROFILES_TABLE).insert({
      id: input.id,
      role: input.role,
      first_name: withRoleSelected.first_name,
      last_name: withRoleSelected.last_name,
      full_name,
      balance: 0
    }));
  }

  if (error && isPostgrestMissingColumnError(error.message, "first_name")) {
    ({ error } = await supabase.from(PROFILES_TABLE).insert({
      id: input.id,
      role: input.role,
      full_name,
      balance: 0
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
  signupNames?: ProfileNameInput
): Promise<ProfileRole> {
  const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
  if (profile?.role && isProfileRole(profile.role)) {
    return profile.role;
  }

  const meta = user.user_metadata ?? {};
  const metaRole = meta.role;
  if (typeof metaRole === "string" && isProfileRole(metaRole)) {
    const r = await ensureProfile(supabase, {
      id: user.id,
      role: metaRole,
      first_name: typeof meta.first_name === "string" ? meta.first_name : undefined,
      last_name: typeof meta.last_name === "string" ? meta.last_name : undefined,
      full_name: typeof meta.full_name === "string" ? meta.full_name : undefined
    });
    if (r.error) console.warn("[auth] ensureProfile:", r.error);
    return metaRole;
  }

  if (signupRole) {
    const r = await ensureProfile(supabase, {
      id: user.id,
      role: signupRole,
      ...signupNames
    });
    if (r.error) console.warn("[auth] ensureProfile:", r.error);
    return signupRole;
  }

  const r = await ensureProfile(supabase, { id: user.id, role: "parent" });
  if (r.error) console.warn("[auth] ensureProfile:", r.error);
  return "parent";
}
