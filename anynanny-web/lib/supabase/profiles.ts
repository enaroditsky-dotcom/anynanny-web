export const PROFILES_TABLE = "profiles" as const;

export type ProfileRole = "parent" | "sitter";

export function isProfileRole(v: string | null | undefined): v is ProfileRole {
  return v === "parent" || v === "sitter";
}
