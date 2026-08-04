/** Resolve first/last name collected at signup for later onboarding/profile screens. */

export type SignupNamePair = {
  first_name: string;
  last_name: string;
};

/** Device cache so onboarding can reuse signup names even before DB rows are ready. */
export const SIGNUP_NAMES_STORAGE_KEY = "anynanny_signup_names";

export function trimName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Prefer the first non-empty pair from the provided sources (left → right). */
export function coalesceSignupNames(
  ...sources: Array<{ first_name?: unknown; last_name?: unknown } | null | undefined>
): SignupNamePair {
  let first_name = "";
  let last_name = "";
  for (const source of sources) {
    if (!source) continue;
    if (!first_name) first_name = trimName(source.first_name);
    if (!last_name) last_name = trimName(source.last_name);
    if (first_name && last_name) break;
  }
  return { first_name, last_name };
}

export function hasCompleteSignupNames(names: SignupNamePair): boolean {
  return Boolean(names.first_name && names.last_name);
}

export function namesFromUserMetadata(
  meta: Record<string, unknown> | null | undefined
): { first_name?: string; last_name?: string } {
  if (!meta) return {};
  return {
    first_name: trimName(meta.first_name) || undefined,
    last_name: trimName(meta.last_name) || undefined
  };
}

export function saveSignupNamesToDevice(names: SignupNamePair): void {
  if (!hasCompleteSignupNames(names)) return;
  try {
    localStorage.setItem(
      SIGNUP_NAMES_STORAGE_KEY,
      JSON.stringify({
        first_name: names.first_name,
        last_name: names.last_name
      })
    );
  } catch {
    /* ignore quota */
  }
}

export function readSignupNamesFromDevice(): SignupNamePair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SIGNUP_NAMES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { first_name?: unknown; last_name?: unknown };
    const names = coalesceSignupNames(parsed);
    return hasCompleteSignupNames(names) ? names : null;
  } catch {
    return null;
  }
}
