import type { ProfileRole } from "@/lib/supabase/profiles";

/**
 * Onboarding can be read successfully as finished or unfinished.
 * Database, permission, schema, and network failures are a third state.
 * Callers must not treat that third state as unfinished.
 */
export type OnboardingReadState = "complete" | "incomplete" | "unreadable";

export type OnboardingRead = {
  state: OnboardingReadState;
  completedAt: string | null;
};

export const ONBOARDING_UNAVAILABLE_PATH = "/auth/onboarding-unavailable";

const FORCED_ONBOARDING_PREFIXES = ["/parent/onboarding", "/sitter/onboarding", "/charter", "/welcome"] as const;

export function pathnameOnly(nextPath: string): string {
  const path = (nextPath.split("?")[0] || nextPath).replace(/\/+$/, "") || "/";
  return path;
}

/** Successful read: a non-empty timestamp is complete. Any query error is unreadable. */
export function classifyOnboardingRead(input: {
  error: unknown;
  completedAt: unknown;
}): OnboardingRead {
  if (input.error) {
    return { state: "unreadable", completedAt: null };
  }
  const at = typeof input.completedAt === "string" ? input.completedAt.trim() : "";
  if (at) return { state: "complete", completedAt: at };
  return { state: "incomplete", completedAt: null };
}

/**
 * Sitter login gate.
 * A timestamp completes onboarding. An already-public profile is the pre-timestamp
 * listing rule and is accepted for login only. This does not write a timestamp.
 * A private profile with no timestamp stays incomplete.
 */
export function classifySitterOnboardingRead(input: {
  error: unknown;
  completedAt: unknown;
  isPublic: unknown;
}): OnboardingRead {
  const read = classifyOnboardingRead({ error: input.error, completedAt: input.completedAt });
  if (read.state !== "incomplete") return read;
  if (input.isPublic === true) return { state: "complete", completedAt: null };
  return read;
}

export function onboardingUnreadableHref(role?: ProfileRole | null): string {
  if (role === "parent" || role === "sitter") {
    return `${ONBOARDING_UNAVAILABLE_PATH}?role=${role}`;
  }
  return ONBOARDING_UNAVAILABLE_PATH;
}

export function isOnboardingUnavailablePath(pathname: string): boolean {
  return pathnameOnly(pathname) === ONBOARDING_UNAVAILABLE_PATH;
}

/** Completed accounts must not be sent back through onboarding, Charter, or Welcome via `next`. */
export function isForcedOnboardingNext(nextPath: string): boolean {
  const path = pathnameOnly(nextPath);
  return FORCED_ONBOARDING_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
