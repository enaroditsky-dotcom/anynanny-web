import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadProductProfileOwnership,
  PARENT_DASHBOARD_PATH,
  PARENT_ONBOARDING_PATH,
  roleMismatchHref,
  SECOND_ROLE_PATH
} from "@/lib/auth/product-profiles";
import { hasAcceptedCurrentCharter } from "@/lib/charter/acceptance";
import { charterHref, resolvePreOnboardingPath } from "@/lib/charter/routing";
import {
  hasSitterCompletedOnboarding,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export const SITTER_ONBOARDING_PATH = "/sitter/onboarding";
export const SITTER_DASHBOARD_PATH = "/sitter/dashboard";

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

export function isSitterOnboardingPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === SITTER_ONBOARDING_PATH || path.startsWith(`${SITTER_ONBOARDING_PATH}/`);
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

  if (full.error) {
    return null;
  }

  const at = (full.data as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at;
  return typeof at === "string" && at.trim() ? at : null;
}

/**
 * Route an owned sitter product profile by onboarding_completed_at only.
 * Does not create sitter_profiles rows.
 */
async function pathBeforeRoleOnboarding(
  supabase: SupabaseClient,
  userId: string,
  role: ProfileRole
): Promise<string> {
  const charterAccepted = await hasAcceptedCurrentCharter(supabase, userId, role);
  return resolvePreOnboardingPath({
    role,
    onboardingComplete: false,
    charterAccepted
  });
}

async function resolveOwnedSitterPostAuthPath(supabase: SupabaseClient, userId: string): Promise<string> {
  const completedAt = await loadSitterOnboardingCompletedAt(supabase, userId);
  if (!hasSitterCompletedOnboarding({ onboarding_completed_at: completedAt })) {
    return pathBeforeRoleOnboarding(supabase, userId, "sitter");
  }

  return SITTER_DASHBOARD_PATH;
}

/**
 * Read-only sitter route guard. Does not create rows.
 * Incomplete (`onboarding_completed_at` null) → `/sitter/onboarding`.
 * Complete users on the questionnaire → `/sitter/dashboard`.
 * Callers must confirm sitter product ownership before invoking this.
 */
export async function getSitterOnboardingGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  currentPath: string
): Promise<string | null> {
  const path = currentPath.split("?")[0] || currentPath;
  const completedAt = await loadSitterOnboardingCompletedAt(supabase, userId);
  const complete = hasSitterCompletedOnboarding({ onboarding_completed_at: completedAt });

  if (!complete) {
    const charterAccepted = await hasAcceptedCurrentCharter(supabase, userId, "sitter");
    if (!charterAccepted) {
      return charterHref("sitter");
    }
    if (isSitterOnboardingPath(path)) return null;
    return SITTER_ONBOARDING_PATH;
  }

  if (isSitterOnboardingPath(path)) return SITTER_DASHBOARD_PATH;
  return null;
}

export function isParentOnboardingRoute(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === PARENT_ONBOARDING_PATH || path.startsWith(`${PARENT_ONBOARDING_PATH}/`);
}

/**
 * Read-only parent route guard. Does not create profiles.
 * Callers must confirm parent product ownership before invoking this.
 */
export async function getParentOnboardingGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  currentPath: string
): Promise<string | null> {
  const path = currentPath.split("?")[0] || currentPath;
  const ownership = await loadProductProfileOwnership(supabase, userId);
  const complete = Boolean(ownership?.parentOnboardingComplete);

  if (!complete) {
    const charterAccepted = await hasAcceptedCurrentCharter(supabase, userId, "parent");
    if (!charterAccepted) {
      return charterHref("parent");
    }
    if (isParentOnboardingRoute(path)) return null;
    return PARENT_ONBOARDING_PATH;
  }

  if (isParentOnboardingRoute(path)) return PARENT_DASHBOARD_PATH;
  return null;
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
  /** Portal the user explicitly chose (home login / `?role=`). Not inferred as ownership. */
  requestedRole?: ProfileRole | null;
};

/**
 * Explicit portal only: `requestedRole`, `?role=`, or a portal `next` path.
 * Never infers from profiles.role, active_role, age, or DOB.
 */
function resolveExplicitRequestedPortal(
  nextParam: string | null,
  options?: ResolvePostAuthOptions
): ProfileRole | null {
  if (isProfileRole(options?.requestedRole)) {
    return options.requestedRole;
  }

  if (typeof window !== "undefined") {
    const explicitRole = new URLSearchParams(window.location.search).get("role");
    if (explicitRole === "parent" || explicitRole === "sitter") {
      return explicitRole;
    }
  }

  const cleanNext = sanitizeNextParam(nextParam);
  if (cleanNext) {
    if (cleanNext.startsWith("/sitter") || cleanNext === "/session" || cleanNext.startsWith("/session/")) {
      return "sitter";
    }
    if (cleanNext.startsWith("/parent") || cleanNext.startsWith("/checkout")) {
      return "parent";
    }
  }

  return null;
}

function destinationForMissingPortal(
  requestedPortal: ProfileRole,
  nextParam: string | null
): string {
  const secondRoleNext = sanitizeNextParam(nextParam);
  if (secondRoleNext && (secondRoleNext === SECOND_ROLE_PATH || secondRoleNext.startsWith(`${SECOND_ROLE_PATH}?`))) {
    return secondRoleNext;
  }
  return roleMismatchHref(requestedPortal);
}

/**
 * Where to send the user after login, register, or email confirmation.
 *
 * Explicit portal choice is preserved. Missing ownership for THAT portal
 * goes to role-mismatch — never to the other product portal.
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

    const requestedPortal = resolveExplicitRequestedPortal(nextParam, options);

    /**
     * Test-email sitter shortcut must NOT run when the user explicitly chose Parent.
     * `+sitter` / `+nanny` previously replaced Parent login with the sitter portal.
     */
    if (
      !requestedPortal &&
      (isNannyOnboardingBypassEmail(email) || isSitterTestBypassEmail(email))
    ) {
      return resolveOwnedSitterPostAuthPath(supabase, userId);
    }

    const profile = await loadProfileAuthRow(supabase, userId);
    if (!profile) {
      return "/auth/role-selection";
    }

    const ownership = await loadProductProfileOwnership(supabase, userId);

    if (requestedPortal === "parent") {
      if (!ownership?.hasParent) {
        return destinationForMissingPortal("parent", nextParam);
      }
      if (!ownership.parentOnboardingComplete) {
        return pathBeforeRoleOnboarding(supabase, userId, "parent");
      }
      const nextOk = allowedNextPath("parent", nextParam);
      return nextOk ?? PARENT_DASHBOARD_PATH;
    }

    if (requestedPortal === "sitter") {
      if (!ownership?.hasSitter) {
        return destinationForMissingPortal("sitter", nextParam);
      }
      return resolveOwnedSitterPostAuthPath(supabase, userId);
    }

    // Unscoped post-auth (no login portal): skip role-selection only if a first role already exists.
    const storedRole = isProfileRole(profile.role) ? profile.role : null;
    if (storedRole === "sitter" && ownership?.hasSitter) {
      return resolveOwnedSitterPostAuthPath(supabase, userId);
    }
    if (storedRole === "parent" && ownership?.hasParent) {
      if (!ownership.parentOnboardingComplete) {
        return pathBeforeRoleOnboarding(supabase, userId, "parent");
      }
      return PARENT_DASHBOARD_PATH;
    }

    return "/auth/role-selection";
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