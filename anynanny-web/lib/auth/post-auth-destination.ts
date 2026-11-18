import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isForcedOnboardingNext,
  isOnboardingUnavailablePath,
  onboardingUnreadableHref,
  type OnboardingReadState
} from "@/lib/auth/onboarding-state";
import {
  onboardingStateForRole,
  PARENT_DASHBOARD_PATH,
  PARENT_ONBOARDING_PATH,
  readProductProfileOwnership,
  readSitterOnboardingState,
  roleMismatchHref,
  SECOND_ROLE_PATH,
  type ProductProfileOwnership
} from "@/lib/auth/product-profiles";
import { readCurrentCharterAcceptance } from "@/lib/charter/acceptance";
import { charterHref, resolvePreOnboardingPath } from "@/lib/charter/routing";
import { isProfileRole, type ProfileRole } from "@/lib/supabase/profiles";

export const SITTER_ONBOARDING_PATH = "/sitter/onboarding";
export const SITTER_DASHBOARD_PATH = "/sitter/dashboard";

export type { ProductProfileOwnership };

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

export function isParentOnboardingRoute(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === PARENT_ONBOARDING_PATH || path.startsWith(`${PARENT_ONBOARDING_PATH}/`);
}

/**
 * Incomplete onboarding continues through Charter, then the questionnaire.
 * A failed Charter read stays on the recoverable unavailable screen.
 */
async function pathBeforeRoleOnboarding(
  supabase: SupabaseClient,
  userId: string,
  role: ProfileRole
): Promise<string> {
  const charter = await readCurrentCharterAcceptance(supabase, userId, role);
  if (charter === "unreadable") return onboardingUnreadableHref(role);
  if (charter === "missing") return charterHref(role);
  return resolvePreOnboardingPath({
    role,
    onboardingComplete: false,
    charterAccepted: true
  });
}

async function destinationForOnboardingState(
  supabase: SupabaseClient,
  userId: string,
  role: ProfileRole,
  state: OnboardingReadState,
  nextParam: string | null
): Promise<string> {
  if (state === "unreadable") return onboardingUnreadableHref(role);
  if (state === "incomplete") return pathBeforeRoleOnboarding(supabase, userId, role);
  if (role === "parent") return allowedNextPath("parent", nextParam) ?? PARENT_DASHBOARD_PATH;
  return SITTER_DASHBOARD_PATH;
}

/**
 * Read-only sitter route guard. Does not create rows.
 * Incomplete onboarding follows Charter, then `/sitter/onboarding`.
 * Unreadable onboarding stays off Charter and the questionnaire.
 * Complete users on the questionnaire go to `/sitter/dashboard`.
 */
export async function getSitterOnboardingGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  currentPath: string
): Promise<string | null> {
  try {
    const path = currentPath.split("?")[0] || currentPath;
    const read = await readSitterOnboardingState(supabase, userId);
    if (read.state === "unreadable") return onboardingUnreadableHref("sitter");

    if (read.state === "incomplete") {
      const dest = await pathBeforeRoleOnboarding(supabase, userId, "sitter");
      if (isOnboardingUnavailablePath(dest)) return dest;
      if (dest === charterHref("sitter")) return dest;
      if (isSitterOnboardingPath(path)) return null;
      return dest;
    }

    if (isSitterOnboardingPath(path)) return SITTER_DASHBOARD_PATH;
    return null;
  } catch {
    return onboardingUnreadableHref("sitter");
  }
}

/**
 * Read-only parent route guard. Does not create profiles.
 * Unreadable parent onboarding is not treated as incomplete.
 */
export async function getParentOnboardingGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  currentPath: string
): Promise<string | null> {
  try {
    const path = currentPath.split("?")[0] || currentPath;
    const read = await readProductProfileOwnership(supabase, userId);
    if (read.status === "unreadable") return onboardingUnreadableHref("parent");
    if (read.status === "missing") return "/auth/role-selection";
    if (read.ownership.parentOnboardingState === "unreadable") return onboardingUnreadableHref("parent");

    if (read.ownership.parentOnboardingState === "incomplete") {
      const dest = await pathBeforeRoleOnboarding(supabase, userId, "parent");
      if (isOnboardingUnavailablePath(dest)) return dest;
      if (dest === charterHref("parent")) return dest;
      if (isParentOnboardingRoute(path)) return null;
      return dest;
    }

    if (isParentOnboardingRoute(path)) return PARENT_DASHBOARD_PATH;
    return null;
  } catch {
    return onboardingUnreadableHref("parent");
  }
}

function allowedNextPath(role: ProfileRole, nextParam: string | null): string | null {
  const safe = sanitizeNextParam(nextParam);
  if (!safe || isForcedOnboardingNext(safe)) return null;
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

async function destinationForOwnedPortal(
  supabase: SupabaseClient,
  userId: string,
  ownership: ProductProfileOwnership,
  portal: ProfileRole,
  nextParam: string | null
): Promise<string> {
  const state = onboardingStateForRole(ownership, portal);
  if (state === "unreadable") return onboardingUnreadableHref(portal);
  const owns = portal === "parent" ? ownership.hasParent : ownership.hasSitter;
  if (!owns) return destinationForMissingPortal(portal, nextParam);
  return destinationForOnboardingState(supabase, userId, portal, state, nextParam);
}

/**
 * Where to send the user after login, register, or email confirmation.
 *
 * Explicit portal choice is preserved. Missing ownership for THAT portal
 * goes to role-mismatch — never to the other product portal.
 * Unreadable onboarding never goes to Charter or a questionnaire.
 * Completed users ignore stale onboarding, Charter, and Welcome `next` values.
 */
export async function resolvePostAuthPath(
  supabase: SupabaseClient,
  userId: string,
  nextParam: string | null,
  options?: ResolvePostAuthOptions
): Promise<string> {
  let requestedPortal: ProfileRole | null = null;
  try {
    if (!userId) {
      return AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT;
    }

    const bypassFromCaller = options != null && Object.prototype.hasOwnProperty.call(options, "userEmail");
    const email = bypassFromCaller
      ? options.userEmail
      : (await supabase.auth.getUser()).data.user?.email;

    requestedPortal = resolveExplicitRequestedPortal(nextParam, options);

    /**
     * Test-email sitter shortcut must NOT run when the user explicitly chose Parent.
     * `+sitter` / `+nanny` previously replaced Parent login with the sitter portal.
     */
    if (
      !requestedPortal &&
      (isNannyOnboardingBypassEmail(email) || isSitterTestBypassEmail(email))
    ) {
      const sitter = await readSitterOnboardingState(supabase, userId);
      return destinationForOnboardingState(supabase, userId, "sitter", sitter.state, nextParam);
    }

    const read = await readProductProfileOwnership(supabase, userId);
    if (read.status === "unreadable") return onboardingUnreadableHref(requestedPortal);
    if (read.status === "missing") return "/auth/role-selection";

    const ownership = read.ownership;

    if (requestedPortal) {
      return destinationForOwnedPortal(supabase, userId, ownership, requestedPortal, nextParam);
    }

    const storedRole = ownership.role;
    if (storedRole === "sitter" && ownership.hasSitter) {
      return destinationForOwnedPortal(supabase, userId, ownership, "sitter", nextParam);
    }
    if (storedRole === "parent" && ownership.hasParent) {
      return destinationForOwnedPortal(supabase, userId, ownership, "parent", nextParam);
    }

    if (
      ownership.parentOnboardingState === "unreadable" ||
      ownership.sitterOnboardingState === "unreadable"
    ) {
      return onboardingUnreadableHref(storedRole);
    }

    return "/auth/role-selection";
  } catch {
    return onboardingUnreadableHref(requestedPortal);
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
