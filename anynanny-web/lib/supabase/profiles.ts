export const PROFILES_TABLE = "profiles" as const;

export type ProfileRole = "parent" | "sitter";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  role: ProfileRole;
  balance: number;
  /** False until user completes /auth/role-selection (omit on legacy rows). */
  role_selected?: boolean | null;
  /** Set when parent finishes /parent/onboarding. */
  parent_onboarding_completed_at?: string | null;
};

export function isProfileRole(v: string | null | undefined): v is ProfileRole {
  return v === "parent" || v === "sitter";
}
