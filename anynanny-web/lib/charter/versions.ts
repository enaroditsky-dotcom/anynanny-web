import type { ProfileRole } from "@/lib/supabase/profiles";

export const CHARTER_ACCEPTANCES_TABLE = "user_charter_acceptances" as const;

export const CHARTER_TYPES = ["parent", "sitter"] as const;
export type CharterType = (typeof CHARTER_TYPES)[number];

/** Initial Community Charter versions. Future re-acceptance can bump these. */
export const PARENT_CHARTER_VERSION = "parent-v1" as const;
export const SITTER_CHARTER_VERSION = "sitter-v1" as const;

export const CURRENT_CHARTER_VERSION: Record<CharterType, string> = {
  parent: PARENT_CHARTER_VERSION,
  sitter: SITTER_CHARTER_VERSION
};

export function isCharterType(value: string | null | undefined): value is CharterType {
  return value === "parent" || value === "sitter";
}

export function charterTypeForRole(role: ProfileRole): CharterType {
  return role;
}

export function currentCharterVersion(type: CharterType): string {
  return CURRENT_CHARTER_VERSION[type];
}

export function isCurrentCharterVersion(type: CharterType, version: string): boolean {
  return version === CURRENT_CHARTER_VERSION[type];
}
