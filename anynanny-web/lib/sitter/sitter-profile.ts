/** Types & validation for `public.sitter_profiles`. */

export const SITTER_PROFILES_TABLE = "sitter_profiles" as const;

export type SitterProfileRow = {
  id: string;
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
};

/** Payload from `get_sitter_profile_public` RPC — never includes hidden admin fields. */
export type SitterProfilePublic = {
  id: string;
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
};

/** All starred mandatory fields + legal declaration — drives `is_public` on save. */
export function isSitterProfileComplete(p: Partial<SitterProfileRow>): boolean {
  if (!String(p.full_name ?? "").trim()) return false;
  if (!p.birth_date) return false;
  if (!String(p.languages ?? "").trim()) return false;
  if (p.years_experience == null || Number(p.years_experience) < 0) return false;
  if (!String(p.bio ?? "").trim()) return false;
  if (p.hourly_rate_nis == null || Number(p.hourly_rate_nis) <= 0) return false;
  if (!String(p.id_number ?? "").trim()) return false;
  if (!String(p.address_full ?? "").trim()) return false;
  if (!String(p.referee_phone_1 ?? "").trim()) return false;
  if (!String(p.referee_phone_2 ?? "").trim()) return false;
  if (!p.legal_no_criminal_declaration) return false;
  return true;
}
