import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SITTER_PROFILES_TABLE,
  type PublicSitterReview,
  type SitterProfilePublic
} from "@/lib/sitter/sitter-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRouteSitterId(raw: unknown): string | null {
  const id = decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? "") : String(raw ?? "")).trim();
  if (!id || id === "undefined" || id === "null") return null;
  if (!UUID_RE.test(id)) return null;
  return id;
}

function parseRpcJson(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return unwrapRpcProfilePayload(parsed);
    } catch {
      return null;
    }
  }
  return unwrapRpcProfilePayload(raw);
}

/** RPC may return a single object, JSON string, or array — take the first row. */
export function unwrapRpcProfilePayload(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return first as Record<string, unknown>;
    }
    return null;
  }
  if (typeof data === "object") return data as Record<string, unknown>;
  return null;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickBool(row: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = row[key];
    if (v === true || v === "true" || v === 1 || v === "1") return true;
  }
  return false;
}

/**
 * Normalize `get_sitter_profile_public` / `sitter_profiles` row into UI state.
 * Accepts RPC aliases: years_of_experience, transportation_mode, camelCase drift.
 */
export function normalizeSitterProfilePublic(
  raw: Record<string, unknown>,
  fallbackId: string
): SitterProfilePublic {
  const full_name = pickString(raw, "full_name", "fullName");
  const display_name = pickString(raw, "display_name", "displayName");
  const years_of_experience = pickNumber(
    raw,
    "years_of_experience",
    "years_experience",
    "yearsExperience"
  );
  const transportation_mode = pickString(raw, "transportation_mode", "transport_mode", "transportMode");
  const has_car =
    pickBool(raw, "has_car", "hasCar") ||
    transportation_mode === "self" ||
    transportation_mode === "עצמאית";

  return {
    id: pickString(raw, "id") ?? fallbackId,
    full_name,
    nanny_serial: pickString(raw, "nanny_serial", "nannySerial", "nanny_id_number"),
    display_name,
    age_years: pickNumber(raw, "age_years", "ageYears"),
    languages: pickString(raw, "languages"),
    years_experience: years_of_experience,
    years_of_experience,
    transportation_mode,
    bio: pickString(raw, "bio"),
    hourly_rate_nis: pickNumber(raw, "hourly_rate_nis", "hourly_rate", "hourlyRateNis"),
    citizenship_israeli: pickBool(raw, "citizenship_israeli", "citizenshipIsraeli") ? true : null,
    birth_country: pickString(raw, "birth_country", "birthCountry"),
    aliyah_year: pickNumber(raw, "aliyah_year", "aliyahYear"),
    preferred_ages: pickString(raw, "preferred_ages", "preferredAges"),
    has_car,
    homework_help: pickBool(raw, "homework_help", "homeworkHelp"),
    light_cooking: pickBool(raw, "light_cooking", "lightCooking"),
    updated_at: pickString(raw, "updated_at", "updatedAt") ?? new Date().toISOString(),
    is_public: raw.is_public !== false && raw.isPublic !== false,
    avg_rating: pickNumber(raw, "avg_rating", "avgRating"),
    rating_count: pickNumber(raw, "rating_count", "ratingCount") ?? 0,
    avatar_url: pickString(raw, "avatar_url", "avatarUrl")
  };
}

function parseReviews(raw: unknown): PublicSitterReview[] {
  const value = parseRpcJson(raw);
  if (!value) return [];
  const arr = Array.isArray(value) ? value : null;
  if (!arr) return [];
  return arr.filter((x): x is PublicSitterReview => x != null && typeof x === "object");
}

export function formatTransportationMode(
  mode: string | null | undefined,
  hasCar?: boolean
): string | null {
  const m = (mode ?? "").trim().toLowerCase();
  if (hasCar || m === "self" || m === "עצמאית") return "עצמאית";
  if (m === "taxi" || m === "needs_taxi" || m.includes("מונית")) return "צריכה מונית";
  if (!m || m === "all" || m === "הכל") return null;
  return mode?.trim() ?? null;
}

export type ParentSitterProfileLoadResult = {
  profile: SitterProfilePublic | null;
  reviews: PublicSitterReview[];
  error: string | null;
};

/**
 * Parent profile: RPC first (`get_sitter_profile_public`), then `sitter_profiles` fallback.
 */
export async function fetchParentSitterProfile(
  supabase: SupabaseClient,
  sitterId: string
): Promise<ParentSitterProfileLoadResult> {
  const { data: profileJson, error: profErr } = await supabase.rpc("get_sitter_profile_public", {
    target_id: sitterId
  });

  let profile: SitterProfilePublic | null = null;

  if (!profErr) {
    const parsed = unwrapRpcProfilePayload(profileJson) ?? parseRpcJson(profileJson);
    if (parsed) {
      profile = normalizeSitterProfilePublic(parsed, sitterId);
      if (profile.is_public === false) {
        profile = null;
      }
    }
  }

  if (!profile) {
    const { data: row, error: rowErr } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(
        "id, full_name, show_full_name, bio, hourly_rate_nis, years_experience, avg_rating, rating_count, nanny_serial, is_public, updated_at, has_car, languages"
      )
      .eq("id", sitterId)
      .eq("is_public", true)
      .maybeSingle();

    if (!rowErr && row) {
      profile = normalizeSitterProfilePublic(row as Record<string, unknown>, sitterId);
    } else if (profErr) {
      return { profile: null, reviews: [], error: profErr.message };
    }
  }

  if (!profile) {
    return { profile: null, reviews: [], error: profErr?.message ?? null };
  }

  const { data: reviewsRaw, error: revErr } = await supabase.rpc("get_sitter_public_reviews", {
    p_sitter_id: sitterId,
    p_limit: 10
  });

  const reviews = revErr ? [] : parseReviews(reviewsRaw);

  return { profile, reviews, error: null };
}

/** @deprecated Use profile.full_name in UI when available. */
export function resolveParentSitterDisplayName(profile: SitterProfilePublic): string {
  const full = profile.full_name?.trim();
  if (full) return full;
  const display = profile.display_name?.trim();
  if (display && display.toLowerCase() !== "user") return display;
  return "בייביסיטר";
}
