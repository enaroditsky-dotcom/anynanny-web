/** Types & validation for `public.sitter_profiles`. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWorkingCities, type IsraelCity } from "@/lib/geo/israel-cities";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

export const SITTER_PROFILES_TABLE = "sitter_profiles" as const;

/** Column on sitter profile row storing canonical city names (`ISRAEL_CITIES`). */
export const SITTER_WORKING_CITIES_COLUMN = "working_cities" as const;

/**
 * PostgREST table for sitter extended profile rows.
 * Default: `sitter_profiles`. Override only if your project uses a different linked table:
 *   NEXT_PUBLIC_SITTER_PROFILES_TABLE=sitter_profiles
 */
export function getSitterProfilesTable(): string {
  const configured = process.env.NEXT_PUBLIC_SITTER_PROFILES_TABLE?.trim();
  return configured || SITTER_PROFILES_TABLE;
}

export function formatSitterWorkingCitiesError(message: string | null | undefined): string {
  if (!message) return "שמירת אזורי העבודה נכשלה.";
  if (isPostgrestMissingColumnError(message, SITTER_WORKING_CITIES_COLUMN)) {
    return (
      `עמודת ${SITTER_WORKING_CITIES_COLUMN} חסרה בטבלת ${getSitterProfilesTable()}. ` +
      "הריצו sql/add_sitter_profiles_working_cities.sql ב-Supabase."
    );
  }
  return message;
}

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
export const SITTER_PROFILES_USER_COLUMN: SitterProfilesUserColumn =
  getSitterProfilesUserColumn();

/** Join first + last for display (never reads a full_name column). */
export function formatSitterDisplayName(
  row: { first_name?: string | null; last_name?: string | null } | null | undefined
): string | null {
  if (!row || typeof row !== "object") return null;
  const combined = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return combined || null;
}

/**
 * Columns safe to write via `/api/sitter/profile` PUT.
 * Intentionally excludes optional / derived fields (ratings, bank details, serials)
 * and schema-drift-prone columns such as `legal_no_criminal_declaration`.
 */
export const SITTER_PROFILE_PUT_COLUMNS = [
  "first_name",
  "last_name",
  "show_full_name",
  "id_number",
  "birth_date",
  "show_age",
  "citizenship_israeli",
  "birth_country",
  "aliyah_year",
  "address_full",
  "military_service",
  "referee_phone_1",
  "referee_phone_2",
  "years_experience",
  "preferred_ages",
  "has_car",
  "languages",
  "homework_help",
  "light_cooking",
  "bio",
  "hourly_rate_nis",
  "package_price_nis",
  "pricing_model",
  "service_types",
  "service_locations",
  "certifications",
  "working_cities",
  "home_city",
  "years_experience_band",
  "experience_age_groups",
  "has_drivers_license",
  "is_smoker",
  "has_baby_experience",
  "has_multiple_children_experience",
  "current_status",
  "desired_hours_per_week",
  "desired_monthly_income_range",
  "work_type_preferences",
  "travel_distance",
  "accepts_short_notice_shifts",
  "additional_service_interests",
  "preferred_child_age_groups",
  "max_children",
  "has_special_needs_experience",
  "special_needs_experience_details",
  "task_capabilities",
  "has_first_aid_training",
  "has_childcare_training",
  "childcare_training_details",
  "is_public",
  "onboarding_completed_at",
  "updated_at"
] as const;

export type SitterProfilePutColumn = (typeof SITTER_PROFILE_PUT_COLUMNS)[number];

/** Direct client/PostgREST SELECT of these columns is denied after payout-phone hardening. */
export const SITTER_PROFILE_PRIVATE_PAYOUT_COLUMNS = [
  "payout_bit_phone",
  "payout_paybox_phone",
  "payout_paybox_link"
] as const;

/**
 * Own-row Personal Area / profile API SELECT list.
 * Explicit columns only — never `*` (private payout phones) and never `user_id`
 * (production PK is `sitter_profiles.id = auth.uid()`; that column does not exist).
 * Optional local-only columns (referee phones, light_cooking, legal declaration)
 * are omitted so a missing-column error cannot blank the whole Personal Area.
 */
export const SITTER_PROFILE_OWN_SELECT_COLUMNS = [
  "id",
  "nanny_serial",
  "avatar_url",
  "first_name",
  "last_name",
  "show_full_name",
  "id_number",
  "birth_date",
  "show_age",
  "citizenship_israeli",
  "birth_country",
  "aliyah_year",
  "address_full",
  "military_service",
  "years_experience",
  "preferred_ages",
  "has_car",
  "languages",
  "homework_help",
  "bio",
  "hourly_rate_nis",
  "package_price_nis",
  "pricing_model",
  "service_types",
  "service_locations",
  "certifications",
  "working_cities",
  "home_city",
  "years_experience_band",
  "experience_age_groups",
  "has_drivers_license",
  "is_smoker",
  "has_baby_experience",
  "has_multiple_children_experience",
  "current_status",
  "desired_hours_per_week",
  "desired_monthly_income_range",
  "work_type_preferences",
  "travel_distance",
  "accepts_short_notice_shifts",
  "additional_service_interests",
  "preferred_child_age_groups",
  "max_children",
  "has_special_needs_experience",
  "special_needs_experience_details",
  "task_capabilities",
  "has_first_aid_training",
  "has_childcare_training",
  "childcare_training_details",
  "is_public",
  "onboarding_completed_at",
  "updated_at",
  "avg_rating",
  "rating_count"
] as const;

export function isSitterProfilePrivatePayoutColumn(column: string): boolean {
  return (SITTER_PROFILE_PRIVATE_PAYOUT_COLUMNS as readonly string[]).includes(column);
}

export function sitterProfileOwnSelectClause(columns: readonly string[] = SITTER_PROFILE_OWN_SELECT_COLUMNS): string {
  return columns.filter((column) => !isSitterProfilePrivatePayoutColumn(column)).join(", ");
}

/** Load the authenticated sitter's own profile without requesting private payout phones. */
export async function fetchOwnSitterProfileRow(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: SitterProfileRow | null; error: string | null }> {
  const table = getSitterProfilesTable();
  let columns: string[] = [...SITTER_PROFILE_OWN_SELECT_COLUMNS].filter(
    (column) => !isSitterProfilePrivatePayoutColumn(column)
  );

  for (let attempt = 0; attempt < 16; attempt++) {
    if (columns.length === 0) {
      return { data: null, error: "טעינת הפרופיל נכשלה." };
    }

    const { data, error } = await supabase
      .from(table)
      .select(sitterProfileOwnSelectClause(columns))
      .eq("id", userId)
      .maybeSingle();

    if (!error) {
      return { data: (data as SitterProfileRow | null) ?? null, error: null };
    }

    const missing = extractMissingSitterProfileColumn(error.message);
    if (missing && columns.includes(missing) && isPostgrestSchemaDriftError(error.message)) {
      columns = columns.filter((column) => column !== missing);
      continue;
    }

    return { data: null, error: error.message };
  }

  return { data: null, error: "טעינת הפרופיל נכשלה." };
}

export const SITTER_LANGUAGE_OPTIONS = [
  "עברית",
  "ערבית",
  "רוסית",
  "צרפתית",
  "אנגלית"
] as const;

export type SitterLanguage = (typeof SITTER_LANGUAGE_OPTIONS)[number];

const SITTER_LANGUAGE_SET = new Set<string>(SITTER_LANGUAGE_OPTIONS);

const SITTER_LANGUAGE_ALIASES: Record<string, SitterLanguage> = {
  עברית: "עברית",
  ערבית: "ערבית",
  רוסית: "רוסית",
  צרפתית: "צרפתית",
  אנגלית: "אנגלית",
  hebrew: "עברית",
  arabic: "ערבית",
  russian: "רוסית",
  french: "צרפתית",
  english: "אנגלית"
};

/**
 * Normalize languages for `sitter_profiles.languages` (`text[]` in production).
 * Accepts JS arrays, Postgres array strings, or comma-separated text.
 */
export function normalizeSitterLanguages(raw: unknown): SitterLanguage[] {
  const tokens: string[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) {
        tokens.push(item.trim());
      }
    }
  } else if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();

    // Postgres array literal form: {עברית,אנגלית} or {"עברית","אנגלית"}
    const fromPgArray = trimmed.match(/^\{([\s\S]*)\}$/);
    const source = fromPgArray ? fromPgArray[1] : trimmed;

    tokens.push(
      ...source
        .split(/[,،;/|]+/)
        .map((part) =>
          part
            .trim()
            .replace(/^"(.*)"$/, "$1")
            .replace(/^'(.*)'$/, "$1")
        )
        .filter(Boolean)
    );
  }

  const selected = new Set<SitterLanguage>();

  for (const token of tokens) {
    const mapped =
      SITTER_LANGUAGE_ALIASES[token] ??
      SITTER_LANGUAGE_ALIASES[token.toLowerCase()] ??
      (SITTER_LANGUAGE_SET.has(token) ? (token as SitterLanguage) : null);

    if (mapped) {
      selected.add(mapped);
    }
  }

  return SITTER_LANGUAGE_OPTIONS.filter((option) => selected.has(option));
}

/** Display helper — joins normalized languages for UI rows. */
export function formatSitterLanguagesDisplay(raw: unknown): string {
  return normalizeSitterLanguages(raw).join(", ");
}

export const PREFERRED_AGE_MIN = 0;
export const PREFERRED_AGE_MAX = 18;

export type PreferredAgeRange = {
  min: number;
  max: number;
};

function clampPreferredAge(value: number): number {
  if (!Number.isFinite(value)) {
    return PREFERRED_AGE_MIN;
  }

  return Math.min(
    PREFERRED_AGE_MAX,
    Math.max(PREFERRED_AGE_MIN, Math.round(value))
  );
}

/** Format a clean display/range string like `"2-10"`. */
export function formatPreferredAgesRange(min: number, max: number): string {
  const lo = clampPreferredAge(Math.min(min, max));
  const hi = clampPreferredAge(Math.max(min, max));

  return `${lo}-${hi}`;
}

/**
 * Parse preferred ages from text, number pairs, or Postgres `text[]` into `{ min, max }`.
 */
export function parsePreferredAges(raw: unknown): PreferredAgeRange | null {
  if (raw == null || raw === "") {
    return null;
  }

  if (Array.isArray(raw)) {
    // Prefer explicit [min, max] numeric/string pairs written for text[].
    const numericParts: number[] = [];

    for (const item of raw) {
      if (typeof item === "number" && Number.isFinite(item)) {
        numericParts.push(item);
        continue;
      }

      if (typeof item !== "string" || !item.trim()) {
        continue;
      }

      const trimmed = item.trim();

      // Whole-range element like "2-10"
      const rangeInItem = parsePreferredAges(trimmed);

      if (
        rangeInItem &&
        /[-–—]/.test(trimmed) &&
        !/^\d+$/.test(trimmed)
      ) {
        return rangeInItem;
      }

      if (/^\d+$/.test(trimmed)) {
        numericParts.push(Number(trimmed));
      }
    }

    if (numericParts.length >= 2) {
      return {
        min: clampPreferredAge(numericParts[0]),
        max: clampPreferredAge(numericParts[1])
      };
    }

    if (numericParts.length === 1) {
      const age = clampPreferredAge(numericParts[0]);

      return {
        min: age,
        max: age
      };
    }

    for (const item of raw) {
      if (typeof item === "string") {
        const nested = parsePreferredAges(item);

        if (nested) {
          return nested;
        }
      }
    }

    return null;
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const age = clampPreferredAge(raw);

    return {
      min: age,
      max: age
    };
  }

  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  // Strip accidental Postgres array wrapping: {2,10} or {"2","10"} or {2-10}
  const unwrapped = trimmed
    .replace(/^\{|\}$/g, "")
    .replace(/"/g, "")
    .trim();

  const match = unwrapped.match(/(\d+)\s*[-–—toעד,]+\s*(\d+)/i);

  if (match) {
    return {
      min: clampPreferredAge(Number(match[1])),
      max: clampPreferredAge(Number(match[2]))
    };
  }

  const single = unwrapped.match(/^(\d+)$/);

  if (single) {
    const age = clampPreferredAge(Number(single[1]));

    return {
      min: age,
      max: age
    };
  }

  return null;
}

/**
 * Normalize for `sitter_profiles.preferred_ages` (`text[]` in production).
 * Always returns a JS string array like `["2", "10"]` — never a `"2-10"` string.
 */
export function normalizePreferredAges(raw: unknown): string[] {
  const parsed = parsePreferredAges(raw);

  if (!parsed) {
    return [];
  }

  const lo = clampPreferredAge(Math.min(parsed.min, parsed.max));
  const hi = clampPreferredAge(Math.max(parsed.min, parsed.max));

  return [String(lo), String(hi)];
}

/** Display helper — `"2-10"` (or empty) from DB array / legacy string. */
export function formatPreferredAgesDisplay(raw: unknown): string {
  const parsed = parsePreferredAges(raw);

  if (!parsed) {
    return "";
  }

  return formatPreferredAgesRange(parsed.min, parsed.max);
}

/** Build an upsert row with only known writable profile columns (+ user FK). */
export function buildSitterProfilePutRow(
  source: Record<string, unknown>,
  userId: string,
  userColumn: SitterProfilesUserColumn = SITTER_PROFILES_USER_COLUMN
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    [userColumn]: userId
  };

  for (const key of SITTER_PROFILE_PUT_COLUMNS) {
    if (
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== undefined
    ) {
      row[key] = source[key];
    }
  }

  if (userColumn === "user_id") {
    delete row.id;
  }

  if (userColumn === "id") {
    delete row.user_id;
  }

  return row;
}

/** Extract a missing-column name from a PostgREST / Postgres schema error, if present. */
export function extractMissingSitterProfileColumn(
  message: string | null | undefined
): string | null {
  if (!message) {
    return null;
  }

  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column sitter_profiles\.([A-Za-z_][A-Za-z0-9_]*) does not exist/i,
    /column ["'`]([A-Za-z_][A-Za-z0-9_]*)["'`] of relation ["'`]sitter_profiles["'`]/i,
    /column ["'`]([A-Za-z_][A-Za-z0-9_]*)["'`] does not exist/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const column = match?.[1]?.trim();
    if (column && column !== "sitter_profiles") {
      return column;
    }
  }

  return null;
}

export type SitterProfileRow = {
  id: string;
  user_id?: string;

  /** Assigned on insert; babysitter AN-1001+ or expert CONS-1001+. */
  nanny_serial?: string | null;

  /** Profile image URL stored on the linked public.profiles row and merged by the profile API. */
  avatar_url?: string | null;

  first_name: string | null;
  last_name: string | null;
  show_full_name: boolean;
  id_number: string | null;
  birth_date: string | null;
  show_age: boolean;
  citizenship_israeli: boolean | null;
  birth_country: string | null;
  aliyah_year: number | null;
  address_full: string | null;

  /** Canonical city names from `ISRAEL_CITIES` — parent search filters via `.contains`. */
  working_cities?: string[] | null;
  home_city?: string | null;
  years_experience_band?: string | null;
  experience_age_groups?: string[] | null;
  has_drivers_license?: boolean | null;
  is_smoker?: boolean | null;
  has_baby_experience?: boolean | null;
  has_multiple_children_experience?: boolean | null;
  current_status?: string | null;
  desired_hours_per_week?: number | null;
  desired_monthly_income_range?: string | null;
  work_type_preferences?: string[] | null;
  travel_distance?: string | null;
  accepts_short_notice_shifts?: boolean | null;
  additional_service_interests?: string[] | null;
  preferred_child_age_groups?: string[] | null;
  max_children?: number | null;
  has_special_needs_experience?: boolean | null;
  special_needs_experience_details?: string | null;
  task_capabilities?: string[] | null;
  has_first_aid_training?: boolean | null;
  has_childcare_training?: boolean | null;
  childcare_training_details?: string | null;

  military_service: string | null;
  referee_phone_1: string | null;
  referee_phone_2: string | null;
  years_experience: number | null;
  preferred_ages: string | string[] | null;
  has_car: boolean;
  languages: string | string[] | null;
  homework_help: boolean;
  light_cooking: boolean;
  bio: string | null;
  hourly_rate_nis: number | null;

  /** hourly | package — package uses package_price_nis */
  pricing_model?: string | null;

  package_price_nis?: number | null;

  /** babysitter | lactation_consultant | sleep_consultant | doula */
  service_types?: string[] | null;

  /** home_visit | clinic | online */
  service_locations?: string[] | null;

  certifications?: string | null;

  /** Optional — not present on all production schemas; never required for profile PUT. */
  legal_no_criminal_declaration?: boolean;

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
  first_name?: string | null;
  last_name?: string | null;
  nanny_serial?: string | null;
  display_name: string | null;
  age_years: number | null;

  /** Display string (joined). RPCs/rows may store `text[]`. */
  languages: string | null;

  years_experience: number | null;

  /** Some RPC/DB variants expose this alias. */
  years_of_experience?: number | null;

  transportation_mode?: string | null;
  bio: string | null;
  hourly_rate_nis: number | null;
  pricing_model?: string | null;
  package_price_nis?: number | null;
  service_types?: string[] | null;
  certifications?: string | null;
  citizenship_israeli: boolean | null;
  birth_country: string | null;
  aliyah_year: number | null;
  preferred_ages: string | null;
  has_car: boolean;

  /** Canonical cities from `ISRAEL_CITIES` — public on profile card. */
  working_cities?: IsraelCity[];

  homework_help: boolean;
  light_cooking: boolean;
  updated_at: string;
  is_public: boolean;

  /** From `sitter_profiles` (ratings trigger). */
  avg_rating?: number | null;
  rating_count?: number | null;

  /** From `auth.users` metadata via RPC — not a sitter_profiles column. */
  avatar_url?: string | null;

  /** Present when the public payload includes identity status. Display-only. */
  identity_verified?: boolean;

  /**
   * Preferred receiving destination kind (`bit` | `paybox` | `bank`) when the
   * public payload includes it. Never phones, links, or account numbers.
   */
  payout_preferred_method?: string | null;
};

/** Row from `list_public_sitters_search` RPC (parent search cards). */
export type PublicSitterSearchCard = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name: string | null;

  /**
   * Removed from list_public_sitters_search (F7). Kept optional so stale
   * cached payloads still parse; new search RPC results never include email.
   */
  email?: string | null;

  nanny_serial?: string | null;
  years_experience: number | null;
  has_car: boolean;

  /** Canonical cities from `ISRAEL_CITIES` — shown on search cards. */
  working_cities?: IsraelCity[];

  bio: string | null;
  hourly_rate_nis: number | null;

  /** hourly | package — package uses package_price_nis */
  pricing_model?: string | null;

  package_price_nis?: number | null;
  avg_rating: number | null;
  rating_count: number;

  /** From `auth.users` metadata via RPC — not a sitter_profiles column. */
  avatar_url?: string | null;

  /** Service specialties offered (`babysitter`, consultants, doula). */
  service_types?: string[] | null;

  /** Display string (joined) for parent-facing cards. */
  languages?: string | null;

  /** Expert certifications / free-text professional experience. */
  certifications?: string | null;
};

/** One anonymized public review for parent-facing sitter profile screens. */
export type PublicSitterReview = {
  rating: number;
  comment: string;
  created_at: string;
};

/** True when the minimum fields required for a public listing are filled. */
export function isSitterProfileComplete(
  p: Partial<SitterProfileRow>
): boolean {
  if (!formatSitterDisplayName(p)) {
    return false;
  }

  const serviceTypes = Array.isArray(p.service_types)
    ? p.service_types
        .map((type) => String(type).trim())
        .filter(Boolean)
    : [];

  const isExpertOnly = serviceTypes.some((type) =>
    ["lactation_consultant", "sleep_consultant", "doula"].includes(type)
  );

  // פרופיל מומחית דורש טקסט מקצועי.
  // פרופיל בייביסיטר יכול להתפרסם גם לפני מילוי "אודותיי".
  if (isExpertOnly && !String(p.bio ?? "").trim()) {
    return false;
  }

  if (
    !isExpertOnly &&
    (p.years_experience == null || Number(p.years_experience) < 0)
  ) {
    return false;
  }

  const pricingModel =
    p.pricing_model === "package" ? "package" : "hourly";

  if (pricingModel === "package") {
    if (
      p.package_price_nis == null ||
      Number(p.package_price_nis) <= 0
    ) {
      return false;
    }
  } else if (
    p.hourly_rate_nis == null ||
    Number(p.hourly_rate_nis) <= 0
  ) {
    return false;
  }

  if (normalizeWorkingCities(p.working_cities).length === 0) {
    return false;
  }

  return true;
}

/** Sitter finished mandatory dashboard questionnaire (`sitter_profiles.onboarding_completed_at`). */
export function hasSitterCompletedOnboarding(
  p: Partial<SitterProfileRow>
): boolean {
  const at = p.onboarding_completed_at;

  return at != null && String(at).trim().length > 0;
}

/**
 * Ensure a `sitter_profiles` row exists for this user.
 * Optionally seed signup names and service_types (so experts get CONS- on insert).
 */
export async function ensureSitterProfileRowForUser(
  supabase: SupabaseClient,
  userId: string,
  seed?: {
    first_name?: string | null;
    last_name?: string | null;
    service_types?: string[] | null;
  }
): Promise<{ error: string | null }> {
  const col = SITTER_PROFILES_USER_COLUMN;

  const seedFirst =
    typeof seed?.first_name === "string"
      ? seed.first_name.trim()
      : "";

  const seedLast =
    typeof seed?.last_name === "string"
      ? seed.last_name.trim()
      : "";

  const seedTypes = Array.isArray(seed?.service_types)
    ? seed.service_types
        .map((type) => String(type).trim())
        .filter(Boolean)
    : [];

  const { data: existing, error: selectError } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(
      `${col}, first_name, last_name, service_types, nanny_serial`
    )
    .eq(col, userId)
    .maybeSingle();

  if (selectError) {
    return {
      error: selectError.message
    };
  }

  if (existing) {
    const row = existing as {
      first_name?: string | null;
      last_name?: string | null;
      service_types?: string[] | null;
    };

    const patch: Record<string, unknown> = {};

    if (
      seedFirst &&
      !String(row.first_name ?? "").trim()
    ) {
      patch.first_name = seedFirst;
    }

    if (
      seedLast &&
      !String(row.last_name ?? "").trim()
    ) {
      patch.last_name = seedLast;
    }

    if (seedTypes.length > 0) {
      patch.service_types = seedTypes;
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from(SITTER_PROFILES_TABLE)
        .update(patch)
        .eq(col, userId);

      if (updateError) {
        return {
          error: updateError.message
        };
      }
    }

    return {
      error: null
    };
  }

  const now = new Date().toISOString();

  const insertRow: Record<string, unknown> = {
    [col]: userId,
    updated_at: now
  };

  if (seedFirst) {
    insertRow.first_name = seedFirst;
  }

  if (seedLast) {
    insertRow.last_name = seedLast;
  }

  if (seedTypes.length > 0) {
    insertRow.service_types = seedTypes;
  }

  const { error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .insert(insertRow);

  if (error) {
    return {
      error: error.message
    };
  }

  return {
    error: null
  };
}