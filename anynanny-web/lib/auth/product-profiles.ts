import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSitterCompletedOnboarding, SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export const ROLE_MISMATCH_PATH = "/auth/role-mismatch";
export const SECOND_ROLE_PATH = "/auth/second-role";
export const PARENT_ONBOARDING_PATH = "/parent/onboarding";
export const PARENT_DASHBOARD_PATH = "/parent/dashboard";

export type ProductProfileOwnership = {
  role: ProfileRole | null;
  hasParent: boolean;
  hasSitter: boolean;
  parentOnboardingComplete: boolean;
  sitterOnboardingComplete: boolean;
};

function secondRoleStorageKey(userId: string): string {
  return `anynanny_second_role_in_progress:${userId}`;
}

/** First registered product stays on `profiles.role`. The other product is owned only after that role's onboarding timestamp exists. */
export function interpretProductProfileOwnership(input: {
  role?: string | null;
  parent_onboarding_completed_at?: string | null;
  sitter_onboarding_completed_at?: string | null;
}): ProductProfileOwnership {
  const role = isProfileRole(input.role) ? input.role : null;
  const parentOnboardingComplete = Boolean(input.parent_onboarding_completed_at?.trim());
  const sitterOnboardingComplete = Boolean(input.sitter_onboarding_completed_at?.trim());

  return {
    role,
    hasParent: role === "parent" || parentOnboardingComplete,
    hasSitter: role === "sitter" || sitterOnboardingComplete,
    parentOnboardingComplete,
    sitterOnboardingComplete
  };
}

export function roleMismatchHref(requested: ProfileRole): string {
  return `${ROLE_MISMATCH_PATH}?requested=${requested}`;
}

export function secondRoleHref(role: ProfileRole): string {
  return `${SECOND_ROLE_PATH}?role=${role}`;
}

export function isParentOnboardingPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === PARENT_ONBOARDING_PATH || path.startsWith(`${PARENT_ONBOARDING_PATH}/`);
}

export function markSecondRoleInProgress(userId: string, role: ProfileRole): void {
  try {
    localStorage.setItem(secondRoleStorageKey(userId), role);
  } catch {
    /* ignore quota */
  }
}

export function readSecondRoleInProgress(userId: string): ProfileRole | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(secondRoleStorageKey(userId));
    return isProfileRole(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearSecondRoleInProgress(userId: string, role?: ProfileRole): void {
  try {
    if (role && readSecondRoleInProgress(userId) !== role) return;
    localStorage.removeItem(secondRoleStorageKey(userId));
  } catch {
    /* ignore */
  }
}

export function isSecondRoleOnboardingAllowed(userId: string, role: ProfileRole): boolean {
  return readSecondRoleInProgress(userId) === role;
}

async function loadSitterOnboardingCompletedAt(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const fk = SITTER_PROFILES_USER_COLUMN;
  const full = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select("onboarding_completed_at")
    .eq(fk, userId)
    .maybeSingle();

  if (full.error) return null;

  const at = (full.data as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at;
  return typeof at === "string" && at.trim() ? at : null;
}

export async function loadProductProfileOwnership(
  supabase: SupabaseClient,
  userId: string
): Promise<ProductProfileOwnership | null> {
  const full = await supabase
    .from(PROFILES_TABLE)
    .select("role, parent_onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  let role: string | null = null;
  let parentOnboarding: string | null = null;

  if (!full.error && full.data && typeof full.data === "object") {
    const row = full.data as { role?: string | null; parent_onboarding_completed_at?: string | null };
    role = typeof row.role === "string" ? row.role : null;
    parentOnboarding =
      typeof row.parent_onboarding_completed_at === "string" ? row.parent_onboarding_completed_at : null;
  } else if (full.error && isPostgrestMissingColumnError(full.error.message, "parent_onboarding_completed_at")) {
    const roleOnly = await supabase.from(PROFILES_TABLE).select("role").eq("id", userId).maybeSingle();
    if (roleOnly.error || roleOnly.data == null) return null;
    role = typeof (roleOnly.data as { role?: string | null }).role === "string"
      ? (roleOnly.data as { role: string }).role
      : null;
  } else if (full.error || full.data == null) {
    return null;
  }

  const sitterCompletedAt = await loadSitterOnboardingCompletedAt(supabase, userId);

  return interpretProductProfileOwnership({
    role,
    parent_onboarding_completed_at: parentOnboarding,
    sitter_onboarding_completed_at: hasSitterCompletedOnboarding({ onboarding_completed_at: sitterCompletedAt })
      ? sitterCompletedAt
      : null
  });
}
