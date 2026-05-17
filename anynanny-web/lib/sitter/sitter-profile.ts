/** Types & validation for `public.sitter_profiles`. */

import type { SupabaseClient } from "@supabase/supabase-js";

export const SITTER_PROFILES_TABLE = "sitter_profiles" as const;

/**
 * Column linking `sitter_profiles` to `auth.users`.
 * Canonical schema: `id uuid primary key references auth.users(id)`.
 * If your DB uses `user_id` instead, set in `.env.local`:
 *   NEXT_PUBLIC_SITTER_PROFILES_USER_COLUMN=user_id
 */
export type SitterProfilesUserColumn = "id" | "user_id";

export function getSitterProfilesUserColumn(): SitterProfilesUserColumn {
  if (process.env.NEXT_PUBLIC_SITTER_PROFILES_USER_COLUMN === "user_id") {
    return "user_id";
  }
  return "id";
}

/** Resolved at runtime (same on server + client for NEXT_PUBLIC_*). */
export const SITTER_PROFILES_USER_COLUMN: SitterProfilesUserColumn = getSitterProfilesUserColumn();

export type SitterProfileRow = {
  id: string;
  user_id?: string;
  /** Assigned on onboarding completion; format e.g. AN-1001 */
  nanny_serial?: string | null;
  full_name: string | null;
  show_full_name: boolean;
  id_number: string | null;
  birth_date: string | null;
  show_age: boolean;
  citizenship_israeli: boolean | null;
  birth_country: string | null;
  aliyah_year: number | null;
  address_full: string | null;
  military_service: string | null;
  referee_phone_1: string | null;
  referee_phone_2: string | null;
  years_experience: number | null;
  preferred_ages: string | null;
  has_car: boolean;
  languages: string | null;
  homework_help: boolean;
  light_cooking: boolean;
  bio: string | null;
  hourly_rate_nis: number | null;
  legal_no_criminal_declaration: boolean;
  is_public: boolean;
  onboarding_completed_at: string | null;
  updated_at: string;
  /** Average rating from `public.ratings` (maintained by DB trigger). */
  avg_rating?: number | null;
  rating_count?: number | null;
};

/** Payload from `get_sitter_profile_public` RPC — never includes hidden admin fields. */
export type SitterProfilePublic = {
  id: string;
  full_name?: string | null;
  nanny_serial?: string | null;
  display_name: string | null;
  age_years: number | null;
  languages: string | null;
  years_experience: number | null;
  bio: string | null;
  hourly_rate_nis: number | null;
  citizenship_israeli: boolean | null;
  birth_country: string | null;
  aliyah_year: number | null;
  preferred_ages: string | null;
  has_car: boolean;
  homework_help: boolean;
  light_cooking: boolean;
  updated_at: string;
  is_public: boolean;
  /** From `sitter_profiles` (ratings trigger). */
  avg_rating?: number | null;
  rating_count?: number | null;
  /** From `auth.users` metadata via RPC — not a sitter_profiles column. */
  avatar_url?: string | null;
};

/** Row from `list_public_sitters_search` RPC (parent search cards). */
export type PublicSitterSearchCard = {
  id: string;
  /** Raw `sitter_profiles.full_name` — preferred for card title. */
  full_name?: string | null;
  display_name: string | null;
  /** From `auth.users.email` via RPC — fallback when name missing. */
  email?: string | null;
  nanny_serial?: string | null;
  years_experience: number | null;
  has_car: boolean;
  bio: string | null;
  hourly_rate_nis: number | null;
  avg_rating: number | null;
  rating_count: number;
  /** From `auth.users` metadata via RPC — not a sitter_profiles column. */
  avatar_url?: string | null;
};

/** One anonymized review from `get_sitter_public_reviews` RPC. */
export type PublicSitterReview = {
  rating: number;
  comment: string;
  created_at: string;
};

/** True when core listing fields are filled (ת.ז. / ממליצים / ארנק — בהמשך). */
export function isSitterProfileComplete(p: Partial<SitterProfileRow>): boolean {
  if (!String(p.full_name ?? "").trim()) return false;
  if (!String(p.bio ?? "").trim()) return false;
  if (p.years_experience == null || Number(p.years_experience) < 0) return false;
  if (p.hourly_rate_nis == null || Number(p.hourly_rate_nis) <= 0) return false;
  return true;
}

/** Sitter finished mandatory dashboard questionnaire (`sitter_profiles.onboarding_completed_at`). */
export function hasSitterCompletedOnboarding(p: Partial<SitterProfileRow>): boolean {
  const at = p.onboarding_completed_at;
  return at != null && String(at).trim().length > 0;
}

/**
 * Ensure a `sitter_profiles` row exists for this user (id-only stub). Call after role = sitter
 * so PostgREST upserts and middleware checks never hit a missing row.
 */
export async function ensureSitterProfileRowForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ error: string | null }> {
  const col = SITTER_PROFILES_USER_COLUMN;
  const { data: existing, error: selErr } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(col)
    .eq(col, userId)
    .maybeSingle();
  if (selErr) return { error: selErr.message };
  if (existing) return { error: null };

  const now = new Date().toISOString();
  const insertRow: Record<string, unknown> = {
    [col]: userId,
    updated_at: now
  };
  const { error } = await supabase.from(SITTER_PROFILES_TABLE).insert(insertRow);
  if (error) return { error: error.message };
  return { error: null };
}
