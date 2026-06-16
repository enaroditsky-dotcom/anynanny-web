import type { SupabaseClient } from "@supabase/supabase-js";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export type ProfileAuthRow = {
  role: string | null;
  role_selected?: boolean | null;
  parent_onboarding_completed_at?: string | null;
};

/** Safe redirect when auth routing cannot proceed (missing profile, thrown errors). */
export const AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT = "/auth/login?next=/auth/role-selection";

/** Dev/test: never send these users to role-selection (breaks sitter redirect loops). */
export function isSitterTestBypassEmail(email: string | null | undefined): boolean {
  return Boolean(email?.includes("+sitter"));
}

/** Dev/test: nanny alias — same fast path as sitter dashboard. */
export function isNannyOnboardingBypassEmail(email: string | null | undefined): boolean {
  return Boolean(email?.includes("+nanny"));
}

function asProfileAuthRow(value: unknown): ProfileAuthRow | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const role = typeof o.role === "string" || o.role === null ? (o.role as string | null) : null;
  return {
    role,
    role_selected: typeof o.role_selected === "boolean" || o.role_selected === null ? (o.role_selected as boolean | null) : undefined,
    parent_onboarding_completed_at:
      typeof o.parent_onboarding_completed_at === "string" || o.parent_onboarding_completed_at === null
        ? (o.parent_onboarding_completed_at as string | null)
        : undefined
  };
}

/** Safe deep-link target from `?next=` (relative app path only; blocks traversal and protocol-relative URLs). */
export function sanitizeNextParam(nextParam: string | null): string | null {
  if (!nextParam || nextParam.includes("..") || nextParam.startsWith("//")) return null;
  if (!nextParam.startsWith("/")) return null;
  return nextParam;
}

function allowedNextPath(role: ProfileRole, nextParam: string | null): string | null {
  const safe = sanitizeNextParam(nextParam);
  if (!safe) return null;
  if (role === "parent") {
    if (safe.startsWith("/parent") || safe.startsWith("/checkout")) return safe;
    return null;
  }
  if (
    safe === "/session" ||
    safe.startsWith("/session/") ||
    safe === "/sitter" ||
    safe.startsWith("/sitter/")
  ) {
    return safe;
  }
  return null;
}

/**
 * Load profile row for routing; tolerates DBs that have not yet run onboarding column migrations.
 * Legacy rows without `role_selected` behave as role_selected = true once the column exists.
 */
async function loadProfileAuthRow(supabase: SupabaseClient, userId: string): Promise<ProfileAuthRow | null> {
  const full = await supabase
    .from(PROFILES_TABLE)
    .select("role, role_selected, parent_onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (!full.error) {
    return asProfileAuthRow(full.data);
  }

  const errMsg = full.error.message ?? "";
  if (!isPostgrestMissingColumnError(errMsg, "role_selected") && !isPostgrestMissingColumnError(errMsg, "parent_onboarding_completed_at")) {
    return null;
  }

  const mid = await supabase
    .from(PROFILES_TABLE)
    .select("role, parent_onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (!mid.error) {
    const parsed = asProfileAuthRow(mid.data);
    if (!parsed) return null;
    return { ...parsed, role_selected: true };
  }
  if (!isPostgrestMissingColumnError(mid.error.message ?? "", "parent_onboarding_completed_at")) {
    return null;
  }

  const rs = await supabase.from(PROFILES_TABLE).select("role, role_selected").eq("id", userId).maybeSingle();
  if (!rs.error && rs.data) {
    const parsed = asProfileAuthRow(rs.data);
    if (!parsed) return null;
    return { ...parsed, parent_onboarding_completed_at: parsed.parent_onboarding_completed_at ?? null };
  }

  const roleOnly = await supabase.from(PROFILES_TABLE).select("role").eq("id", userId).maybeSingle();
  if (roleOnly.error || roleOnly.data == null) return null;
  const parsedRole = asProfileAuthRow(roleOnly.data);
  if (!parsedRole) return null;
  return {
    role: parsedRole.role,
    role_selected: true,
    parent_onboarding_completed_at: null
  };
}

export type ResolvePostAuthOptions = {
  /**
   * When provided (object includes `userEmail` key), test-bypass uses this value and skips `auth.getUser()`.
   * Use from middleware after `getUser()` so `+nanny` / `+sitter` bypass returns immediately with no DB `.from()` calls.
   */
  userEmail?: string | null;
};

/**
 * Where to send the user after login, register, or email confirmation.
 * A row in `sitter_profiles` for a sitter user counts as `role_selected: true` (skip /auth/role-selection).
 */
export async function resolvePostAuthPath(
  supabase: SupabaseClient,
  userId: string,
  nextParam: string | null,
  options?: ResolvePostAuthOptions
): Promise<string> {
  try {
    if (!userId) {
      return AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT;
    }

    const bypassFromCaller = options != null && Object.prototype.hasOwnProperty.call(options, "userEmail");
    const email = bypassFromCaller
      ? options.userEmail
      : (await supabase.auth.getUser()).data.user?.email;
    /** Must stay first: `+nanny` routes like other sitters — dashboard. */
    if (isNannyOnboardingBypassEmail(email)) {
      return "/sitter/dashboard";
    }
    if (isSitterTestBypassEmail(email)) {
      return "/sitter/dashboard";
    }

    const fk = SITTER_PROFILES_USER_COLUMN;
    const sitterRes = await supabase.from(SITTER_PROFILES_TABLE).select(fk).eq(fk, userId).maybeSingle();
    const hasSitterProfile =
      !sitterRes.error &&
      sitterRes.data != null &&
      typeof sitterRes.data === "object" &&
      fk in sitterRes.data;

    const profile = await loadProfileAuthRow(supabase, userId);
    if (!profile) {
      return "/auth/role-selection";
    }

    const role = isProfileRole(profile.role) ? profile.role : null;
    if (!role) {
      return "/auth/role-selection";
    }

    /** Same trust as legacy parents: a real `sitter_profiles` row means role choice is done. */
    let row: ProfileAuthRow = { ...profile };
    if (hasSitterProfile && role === "sitter") {
      row = { ...row, role_selected: true };
    }

    const needsRoleSelection = row.role_selected === false;

    if (needsRoleSelection) {
      if (role === "parent" && row.parent_onboarding_completed_at) {
        const nextOk = allowedNextPath("parent", nextParam);
        return nextOk ?? "/parent/search";
      }
      return "/auth/role-selection";
    }

    if (role === "parent") {
      if (!row.parent_onboarding_completed_at) {
        return "/parent/onboarding";
      }
      const nextOk = allowedNextPath("parent", nextParam);
      return nextOk ?? "/parent/search";
    }

    /** Sitter: dashboard first; optional questionnaire on dashboard. */
    return "/sitter/dashboard";
  } catch {
    return AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT;
  }
}

/** True when authenticated user must complete /auth/role-selection before app routes. */
export async function userNeedsRoleSelection(
  supabase: SupabaseClient,
  userId: string,
  options?: ResolvePostAuthOptions
): Promise<boolean> {
  const dest = await resolvePostAuthPath(supabase, userId, null, options);
  const base = dest.split("?")[0];
  return base === "/auth/role-selection";
}

/** Redirect URL if `currentPath` is blocked for this user; otherwise null. */
export async function getRoleGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  currentPath: string,
  userEmail?: string | null
): Promise<string | null> {
  if (currentPath === "/auth/role-selection" || currentPath.startsWith("/auth/role-selection/")) {
    return null;
  }
  const needs = await userNeedsRoleSelection(supabase, userId, { userEmail });
  if (!needs) return null;
  const url = new URL("/auth/role-selection", "http://local");
  const safeNext = sanitizeNextParam(currentPath);
  if (safeNext) url.searchParams.set("next", safeNext);
  return `${url.pathname}${url.search}`;
}
