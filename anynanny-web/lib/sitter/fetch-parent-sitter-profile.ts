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

function parseRpcJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as T;
  return null;
}

function parseReviews(raw: unknown): PublicSitterReview[] {
  const value = parseRpcJson<unknown>(raw);
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is PublicSitterReview => x != null && typeof x === "object");
}

function displayNameFromRow(row: {
  full_name?: string | null;
  show_full_name?: boolean | null;
}): string | null {
  const full = (row.full_name ?? "").trim();
  if (row.show_full_name && full) return full;
  if (full) {
    const first = full.split(/\s+/)[0]?.trim();
    if (first) return first;
  }
  return full || null;
}

function rowToPublicProfile(row: Record<string, unknown>): SitterProfilePublic {
  const id = String(row.id ?? "");
  const full_name = typeof row.full_name === "string" ? row.full_name : null;
  return {
    id,
    full_name,
    nanny_serial: typeof row.nanny_serial === "string" ? row.nanny_serial : null,
    display_name: displayNameFromRow({
      full_name,
      full_name: typeof row.full_name === "string" ? row.full_name : null,
      show_full_name: row.show_full_name === true
    }),
    age_years: null,
    languages: typeof row.languages === "string" ? row.languages : null,
    years_experience:
      typeof row.years_experience === "number"
        ? row.years_experience
        : row.years_experience != null
          ? Number(row.years_experience)
          : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    hourly_rate_nis:
      typeof row.hourly_rate_nis === "number"
        ? row.hourly_rate_nis
        : row.hourly_rate_nis != null
          ? Number(row.hourly_rate_nis)
          : null,
    citizenship_israeli: null,
    birth_country: null,
    aliyah_year: null,
    preferred_ages: null,
    has_car: row.has_car === true,
    homework_help: false,
    light_cooking: false,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    is_public: row.is_public === true,
    avg_rating:
      typeof row.avg_rating === "number" ? row.avg_rating : row.avg_rating != null ? Number(row.avg_rating) : null,
    rating_count:
      typeof row.rating_count === "number"
        ? row.rating_count
        : row.rating_count != null
          ? Number(row.rating_count)
          : 0,
    avatar_url: null
  };
}

export type ParentSitterProfileLoadResult = {
  profile: SitterProfilePublic | null;
  reviews: PublicSitterReview[];
  error: string | null;
};

/**
 * Load a public sitter profile for parents by `sitter_profiles.id` (auth user uuid).
 * Tries direct table read first; falls back to security-definer RPCs if RLS blocks.
 */
export async function fetchParentSitterProfile(
  supabase: SupabaseClient,
  sitterId: string
): Promise<ParentSitterProfileLoadResult> {
  const { data: row, error: rowErr } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(
      "id, full_name, show_full_name, bio, hourly_rate_nis, years_experience, avg_rating, rating_count, nanny_serial, is_public, updated_at, has_car, languages"
    )
    .eq("id", sitterId)
    .eq("is_public", true)
    .maybeSingle();

  let profile: SitterProfilePublic | null = null;

  if (!rowErr && row) {
    profile = rowToPublicProfile(row as Record<string, unknown>);
  }

  if (!profile) {
    const { data: profileJson, error: profErr } = await supabase.rpc("get_sitter_profile_public", {
      target_id: sitterId
    });
    if (profErr) {
      return { profile: null, reviews: [], error: profErr.message };
    }
    const parsed = parseRpcJson<Record<string, unknown>>(profileJson);
    if (!parsed) {
      return { profile: null, reviews: [], error: null };
    }
    profile = {
      ...(parsed as unknown as SitterProfilePublic),
      full_name:
        typeof parsed.full_name === "string"
          ? parsed.full_name
          : typeof parsed.display_name === "string"
            ? parsed.display_name
            : null,
      id: String(parsed.id ?? sitterId)
    };
    if (profile.is_public === false) {
      return { profile: null, reviews: [], error: null };
    }
  }

  const { data: reviewsRaw, error: revErr } = await supabase.rpc("get_sitter_public_reviews", {
    p_sitter_id: sitterId,
    p_limit: 10
  });

  const reviews = revErr ? [] : parseReviews(reviewsRaw);

  return { profile, reviews, error: null };
}

/** Preferred heading on parent sitter profile. */
export function resolveParentSitterDisplayName(profile: SitterProfilePublic): string {
  const full = profile.full_name?.trim();
  if (full) return full;
  const display = profile.display_name?.trim();
  if (display && display.toLowerCase() !== "user") return display;
  return "בייביסיטר";
}
