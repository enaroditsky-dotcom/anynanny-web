import { PARENT_ONBOARDING_PATH } from "@/lib/auth/product-profiles";
import type { CharterType } from "@/lib/charter/versions";
import type { ProfileRole } from "@/lib/supabase/profiles";

const SITTER_ONBOARDING_PATH = "/sitter/onboarding";

export const WELCOME_PATH = "/welcome";
export const CHARTER_PATH = "/charter";
export const CHARTER_FULL_PATH = "/charter/full";

export type WelcomeViewMode = "mandatory" | "replay";
export type CharterViewMode = "accept" | "readonly";

export function isWelcomePath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === WELCOME_PATH || path.startsWith(`${WELCOME_PATH}/`);
}

export function isCharterPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === CHARTER_PATH || path.startsWith(`${CHARTER_PATH}/`);
}

export function isPreOnboardingPath(pathname: string): boolean {
  return isWelcomePath(pathname) || isCharterPath(pathname);
}

export function signupPathForRole(role: ProfileRole): string {
  const params = new URLSearchParams({ role });
  if (role === "sitter") params.set("track", "babysitter");
  return `/register?${params.toString()}`;
}

/** Safe post-Welcome signup destination. Only register / sign-up paths. */
export function sanitizeSignupNext(nextParam: string | null | undefined): string | null {
  if (!nextParam || nextParam.includes("..") || nextParam.startsWith("//")) return null;
  if (!nextParam.startsWith("/")) return null;
  const path = nextParam.split("?")[0] || nextParam;
  if (path === "/register" || path.startsWith("/register/")) return nextParam;
  if (path === "/auth/sign-up" || path.startsWith("/auth/sign-up/")) return nextParam;
  return null;
}

export function welcomeHref(role: ProfileRole, mode: WelcomeViewMode = "mandatory"): string {
  const params = new URLSearchParams({ role });
  if (mode === "replay") params.set("mode", "replay");
  return `${WELCOME_PATH}?${params.toString()}`;
}

export function welcomeSignupHref(role: ProfileRole, nextPath?: string): string {
  const params = new URLSearchParams({ role });
  params.set("next", nextPath ?? signupPathForRole(role));
  return `${WELCOME_PATH}?${params.toString()}`;
}

export function welcomeReplayHref(role: ProfileRole, from?: string): string {
  const params = new URLSearchParams({ role, mode: "replay" });
  if (from && from.startsWith("/") && !from.startsWith("//")) {
    params.set("from", from);
  }
  return `${WELCOME_PATH}?${params.toString()}`;
}

export function personalAreaPathForRole(role: ProfileRole): string {
  return role === "parent" ? "/parent/profile" : "/sitter/profile";
}

export function charterHref(role: ProfileRole, mode: CharterViewMode = "accept"): string {
  const params = new URLSearchParams({ role });
  if (mode === "readonly") params.set("mode", "readonly");
  return `${CHARTER_PATH}?${params.toString()}`;
}

export function charterFullHref(role: ProfileRole, from?: string): string {
  const params = new URLSearchParams({ role, mode: "readonly" });
  if (from && from.startsWith("/") && !from.startsWith("//")) {
    params.set("from", from);
  }
  return `${CHARTER_FULL_PATH}?${params.toString()}`;
}

export function onboardingPathForRole(role: ProfileRole): string {
  return role === "parent" ? PARENT_ONBOARDING_PATH : SITTER_ONBOARDING_PATH;
}

export function nextPathAfterWelcome(role: ProfileRole, nextParam?: string | null): string {
  return sanitizeSignupNext(nextParam) ?? signupPathForRole(role);
}

export function nextPathAfterCharterAcceptance(role: ProfileRole): string {
  return onboardingPathForRole(role);
}

/**
 * After auth, incomplete onboarding without Charter acceptance goes to Charter.
 * Existing completed users must never be forced through Welcome or Charter.
 */
export function shouldForcePreOnboarding(input: {
  onboardingComplete: boolean;
  charterAccepted: boolean;
}): boolean {
  return !input.onboardingComplete && !input.charterAccepted;
}

export function resolvePreOnboardingPath(input: {
  role: ProfileRole;
  onboardingComplete: boolean;
  charterAccepted: boolean;
}): string {
  if (shouldForcePreOnboarding(input)) {
    return charterHref(input.role, "accept");
  }
  return onboardingPathForRole(input.role);
}

export function parseWelcomeMode(value: string | null): WelcomeViewMode {
  return value === "replay" ? "replay" : "mandatory";
}

export function parseCharterMode(value: string | null): CharterViewMode {
  return value === "readonly" ? "readonly" : "accept";
}

export function charterTypeForWelcomeRole(role: ProfileRole): CharterType {
  return role;
}

/** Prefer the explicit signup/portal role; fall back to the stored profile role. */
export function resolveFlowRole(
  queryRole: string | null | undefined,
  profileRole: ProfileRole | null | undefined
): ProfileRole | null {
  if (queryRole === "parent" || queryRole === "sitter") return queryRole;
  if (profileRole === "parent" || profileRole === "sitter") return profileRole;
  return null;
}
