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

export function welcomeHref(role: ProfileRole, mode: WelcomeViewMode = "mandatory"): string {
  const params = new URLSearchParams({ role });
  if (mode === "replay") params.set("mode", "replay");
  return `${WELCOME_PATH}?${params.toString()}`;
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

export function nextPathAfterWelcome(role: ProfileRole): string {
  return charterHref(role, "accept");
}

export function nextPathAfterCharterAcceptance(role: ProfileRole): string {
  return onboardingPathForRole(role);
}

/**
 * Existing active users (onboarding already complete) must never be forced
 * through Welcome + Charter. New signup/onboarding without acceptance must.
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
    return welcomeHref(input.role, "mandatory");
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
