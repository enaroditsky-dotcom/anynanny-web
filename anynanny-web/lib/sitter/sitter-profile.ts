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
  years_experience: number | null;
  preferred_ages: string | null;
  has_car: boolean;
  languages: string | null;
  homework_help: boolean;
  light_cooking: boolean;
  onboarding_completed_at: string | null;
  updated_at: string;
};

/** Payload from `get_sitter_profile_public` RPC — never includes hidden admin fields. */
export type SitterProfilePublic = {
  id: string;
  display_name: string | null;
  age_years: number | null;
  citizenship_israeli: boolean | null;
  birth_country: string | null;
  aliyah_year: number | null;
  years_experience: number | null;
  preferred_ages: string | null;
  has_car: boolean;
  languages: string | null;
  homework_help: boolean;
  light_cooking: boolean;
  updated_at: string;
};

export function isSitterProfileComplete(p: Partial<SitterProfileRow>): boolean {
  const nameOk = !!String(p.full_name ?? "").trim();
  const birthOk = !!p.birth_date;
  const expOk = p.years_experience != null && p.years_experience >= 0;
  const agesOk = !!String(p.preferred_ages ?? "").trim();
  const langOk = !!String(p.languages ?? "").trim();
  const citizenOk = p.citizenship_israeli === true || p.citizenship_israeli === false;
  const adminOk =
    !!String(p.id_number ?? "").trim() &&
    !!String(p.address_full ?? "").trim();
  return nameOk && birthOk && expOk && agesOk && langOk && citizenOk && adminOk;
}
