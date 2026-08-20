import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILES_TABLE = "profiles" as const;

export type ProfileRole = "parent" | "sitter";

export type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: ProfileRole;
  avatar_url?: string | null;
  balance: number;
  /** Unified public identifier (e.g. AN_1001 / P_1001). */
  public_id?: string | null;
  /** False until user completes /auth/role-selection (omit on legacy rows). */
  role_selected?: boolean | null;
  /** Set when parent finishes /parent/onboarding. */
  parent_onboarding_completed_at?: string | null;
  /** Auto-increment serial for P-/AN- display ids (client adds 1000). */
  serial_id?: number | null;
  /** Legacy parent/sitter-specific ids (fallback when public_id is unset). */
  parent_public_id?: string | null;
  nanny_public_id?: string | null;
  /** Phase 1 identity verification — never auto-set to verified. */
  identity_verification_status?: "unverified" | "pending" | "verified" | "failed" | null;
  identity_verified_at?: string | null;
  identity_verification_method?: string | null;
  identity_id_number?: string | null;
  /** Set only after explicit registration checkbox acceptance. NULL is not acceptance. */
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  /** User preference for Web Push. Default true. Not the same as OS permission. */
  push_enabled?: boolean | null;
  /** In-app sounds/haptics. Does not control OS notification sound. */
  sound_enabled?: boolean | null;
};

export function isProfileRole(v: string | null | undefined): v is ProfileRole {
  return v === "parent" || v === "sitter";
}

/** Join profiles.first_name + last_name for display (never reads a full_name column). */
export function formatProfileDisplayName(
  row: { first_name?: string | null; last_name?: string | null } | null | undefined
): string | null {
  if (!row || typeof row !== "object") return null;
  const combined = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return combined || null;
}

/** Role-scoped profile row fetch — always filters by user id and role. */
export function selectProfileForRole(
  supabase: SupabaseClient,
  userId: string,
  role: ProfileRole,
  columns: string
) {
  return supabase.from(PROFILES_TABLE).select(columns).eq("id", userId).eq("role", role);
}
