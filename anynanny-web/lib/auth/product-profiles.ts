import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyOnboardingRead,
  classifySitterOnboardingRead,
  type OnboardingRead,
  type OnboardingReadState
} from "@/lib/auth/onboarding-state";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
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
  parentOnboardingState: OnboardingReadState;
  sitterOnboardingState: OnboardingReadState;
};

export type ProductProfileRead =
  | { status: "ready"; ownership: ProductProfileOwnership }
  | { status: "missing" }
  | { status: "unreadable" };

function secondRoleStorageKey(userId: string): string {
  return `anynanny_second_role_in_progress:${userId}`;
}

/** First registered product stays on `profiles.role`. The other product is owned only after that role's onboarding timestamp exists. */
export function interpretProductProfileOwnership(input: {
  role?: string | null;
  parent_onboarding_completed_at?: string | null;
  sitter_onboarding_completed_at?: string | null;
  parentOnboardingState?: OnboardingReadState;
  sitterOnboardingState?: OnboardingReadState;
}): ProductProfileOwnership {
  const role = isProfileRole(input.role) ? input.role : null;
  const parentOnboardingState =
    input.parentOnboardingState ??
    (input.parent_onboarding_completed_at?.trim() ? "complete" : "incomplete");
  const sitterOnboardingState =
    input.sitterOnboardingState ??
    (input.sitter_onboarding_completed_at?.trim() ? "complete" : "incomplete");
  const parentOnboardingComplete = parentOnboardingState === "complete";
  const sitterOnboardingComplete = sitterOnboardingState === "complete";

  return {
    role,
    hasParent: role === "parent" || parentOnboardingComplete,
    hasSitter: role === "sitter" || sitterOnboardingComplete,
    parentOnboardingComplete,
    sitterOnboardingComplete,
    parentOnboardingState,
    sitterOnboardingState
  };
}

export function onboardingStateForRole(
  ownership: ProductProfileOwnership,
  role: ProfileRole
): OnboardingReadState {
  return role === "parent" ? ownership.parentOnboardingState : ownership.sitterOnboardingState;
}

/**
 * Portal entry decision.
 * An unreadable onboarding read is not the same as lacking that product.
 */
export function classifyPortalAccess(
  read: ProductProfileRead,
  portal: ProfileRole
): "ready" | "unowned" | "unreadable" {
  if (read.status === "unreadable") return "unreadable";
  if (read.status === "missing") return "unowned";
  if (onboardingStateForRole(read.ownership, portal) === "unreadable") return "unreadable";
  const owns = portal === "parent" ? read.ownership.hasParent : read.ownership.hasSitter;
  return owns ? "ready" : "unowned";
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

export async function readSitterOnboardingState(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingRead> {
  const fk = SITTER_PROFILES_USER_COLUMN;
  const full = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select("onboarding_completed_at, is_public")
    .eq(fk, userId)
    .maybeSingle();

  const row = full.data as { onboarding_completed_at?: string | null; is_public?: boolean | null } | null;
  return classifySitterOnboardingRead({
    error: full.error,
    completedAt: row?.onboarding_completed_at,
    isPublic: row?.is_public
  });
}

/**
 * Read product ownership without collapsing query failures into "no profile" or "not onboarded".
 * A missing profile row is `missing`. Permission, schema, database, and network errors are `unreadable`.
 */
export async function readProductProfileOwnership(
  supabase: SupabaseClient,
  userId: string
): Promise<ProductProfileRead> {
  const full = await supabase
    .from(PROFILES_TABLE)
    .select("role, parent_onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  let role: string | null = null;
  let parentRead: OnboardingRead;

  if (full.error && isPostgrestMissingColumnError(full.error.message, "parent_onboarding_completed_at")) {
    const roleOnly = await supabase.from(PROFILES_TABLE).select("role").eq("id", userId).maybeSingle();
    if (roleOnly.error) return { status: "unreadable" };
    if (roleOnly.data == null) return { status: "missing" };
    role =
      typeof (roleOnly.data as { role?: string | null }).role === "string"
        ? (roleOnly.data as { role: string }).role
        : null;
    parentRead = { state: "unreadable", completedAt: null };
  } else if (full.error) {
    return { status: "unreadable" };
  } else if (full.data == null) {
    return { status: "missing" };
  } else {
    const row = full.data as { role?: string | null; parent_onboarding_completed_at?: string | null };
    role = typeof row.role === "string" ? row.role : null;
    parentRead = classifyOnboardingRead({ error: null, completedAt: row.parent_onboarding_completed_at });
  }

  const sitterRead = await readSitterOnboardingState(supabase, userId);

  return {
    status: "ready",
    ownership: interpretProductProfileOwnership({
      role,
      parent_onboarding_completed_at: parentRead.completedAt,
      sitter_onboarding_completed_at: sitterRead.completedAt,
      parentOnboardingState: parentRead.state,
      sitterOnboardingState: sitterRead.state
    })
  };
}

/**
 * Ownership when the profile row was readable.
 * Routing must use `readProductProfileOwnership`: a null result is either a missing
 * profile or a failed read, and a ready result can still carry an unreadable role state.
 */
export async function loadProductProfileOwnership(
  supabase: SupabaseClient,
  userId: string
): Promise<ProductProfileOwnership | null> {
  const read = await readProductProfileOwnership(supabase, userId);
  return read.status === "ready" ? read.ownership : null;
}
