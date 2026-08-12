import type { SupabaseClient } from "@supabase/supabase-js";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { fetchUserRatingSummary } from "@/lib/ratings/fetch-user-rating-summary";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";
import {
  formatPreferredAgesDisplay,
  formatSitterLanguagesDisplay,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  type PublicSitterReview,
  type SitterProfilePublic
} from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingFunctionError } from "@/lib/supabase/postgrest-schema";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";

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

function pickWorkingCities(row: Record<string, unknown>): SitterProfilePublic["working_cities"] {
  const raw = row.working_cities ?? row.workingCities;
  if (raw == null) return [];
  return normalizeWorkingCities(raw);
}

export function normalizeSitterProfilePublic(
  raw: Record<string, unknown>,
  fallbackId: string
): SitterProfilePublic {
  const first_name = pickString(raw, "first_name", "firstName");
  const last_name = pickString(raw, "last_name", "lastName");
  const display_name =
    pickString(raw, "display_name", "displayName") ??
    (`${first_name ?? ""} ${last_name ?? ""}`.trim() || null);
  const years_experience = pickNumber(
    raw,
    "years_experience",
    "yearsOfExperience",
    "yearsExperience"
  );
  const transportation_mode = pickString(raw, "transportation_mode", "transport_mode", "transportMode");
  const has_car =
    pickBool(raw, "has_car", "hasCar") ||
    transportation_mode === "self" ||
    transportation_mode === "עצמאית";

  return {
    id: pickString(raw, "id") ?? fallbackId,
    first_name,
    last_name,
    nanny_serial: pickString(raw, "nanny_serial", "nannySerial", "nanny_id_number"),
    display_name,
    age_years: pickNumber(raw, "age_years", "ageYears"),
    languages: formatSitterLanguagesDisplay(raw.languages) || null,
    years_experience,
    transportation_mode,
    bio: pickString(raw, "bio"),
    hourly_rate_nis: pickNumber(raw, "hourly_rate_nis", "hourly_rate", "hourlyRateNis"),
    pricing_model:
      pickString(raw, "pricing_model", "pricingModel") === "package" ? "package" : "hourly",
    package_price_nis: pickNumber(raw, "package_price_nis", "packagePriceNis"),
    service_types: (() => {
      const rawTypes = raw.service_types ?? raw.serviceTypes;
      if (!Array.isArray(rawTypes)) return null;
      const types = rawTypes.map((v) => String(v).trim()).filter(Boolean);
      return types.length ? types : null;
    })(),
    certifications: pickString(raw, "certifications"),
    citizenship_israeli: pickBool(raw, "citizenship_israeli", "citizenshipIsraeli") ? true : null,
    birth_country: pickString(raw, "birth_country", "birthCountry"),
    aliyah_year: pickNumber(raw, "aliyah_year", "aliyahYear"),
    preferred_ages: formatPreferredAgesDisplay(raw.preferred_ages ?? raw.preferredAges) || null,
    has_car,
    working_cities: pickWorkingCities(raw),
    homework_help: pickBool(raw, "homework_help", "homeworkHelp"),
    light_cooking: pickBool(raw, "light_cooking", "lightCooking"),
    updated_at: pickString(raw, "updated_at", "updatedAt") ?? new Date().toISOString(),
    is_public: raw.is_public !== false && raw.isPublic !== false,
    avg_rating: pickNumber(raw, "avg_rating", "avgRating"),
    rating_count: pickNumber(raw, "rating_count", "ratingCount") ?? 0,
    avatar_url: pickString(raw, "avatar_url", "avatarUrl")
  };
}

export async function fetchSitterPublicReviews(
  supabase: SupabaseClient,
  sitterId: string,
  limit = 10
): Promise<PublicSitterReview[]> {
  const capped = Math.max(1, Math.min(limit, 20));

  // Prefer security-definer RPC (published + non-empty comments only).
  const { data: rpcJson, error: rpcErr } = await supabase.rpc("get_sitter_public_reviews", {
    p_sitter_id: sitterId,
    p_limit: capped
  });

  if (!rpcErr && rpcJson != null) {
    const rows = Array.isArray(rpcJson)
      ? rpcJson
      : typeof rpcJson === "string"
        ? (() => {
            try {
              return JSON.parse(rpcJson) as unknown[];
            } catch {
              return [];
            }
          })()
        : [];
    return rows
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          rating: Number(r.rating),
          comment: String(r.comment ?? "").trim(),
          created_at: String(r.created_at ?? "")
        };
      })
      .filter(
        (row) =>
          Number.isFinite(row.rating) &&
          row.rating >= 1 &&
          row.rating <= 5 &&
          row.comment.length > 0
      );
  }

  const read = safeSupabaseRead(
    await supabase
      .from(RATINGS_TABLE)
      .select("rating, comment, created_at")
      .eq("to_user_id", sitterId)
      .not("published_at", "is", null)
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(capped),
    "sitter public reviews direct"
  );

  if (read.error || !read.data) {
    // Pre-migration fallback without published_at filter.
    const legacy = safeSupabaseRead(
      await supabase
        .from(RATINGS_TABLE)
        .select("rating, comment, created_at")
        .eq("to_user_id", sitterId)
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(capped),
      "sitter public reviews legacy"
    );
    if (legacy.error || !legacy.data) return [];
    return (legacy.data as Array<Record<string, unknown>>)
      .map((row) => ({
        rating: Number(row.rating),
        comment: String(row.comment ?? "").trim(),
        created_at: String(row.created_at ?? "")
      }))
      .filter(
        (row) =>
          Number.isFinite(row.rating) &&
          row.rating >= 1 &&
          row.rating <= 5 &&
          row.comment.length > 0
      );
  }

  return (read.data as Array<Record<string, unknown>>)
    .map((row) => ({
      rating: Number(row.rating),
      comment: String(row.comment ?? "").trim(),
      created_at: String(row.created_at ?? "")
    }))
    .filter(
      (row) =>
        Number.isFinite(row.rating) &&
        row.rating >= 1 &&
        row.rating <= 5 &&
        row.comment.length > 0
    );
}

async function fetchSitterProfileDirect(
  supabase: SupabaseClient,
  sitterId: string
): Promise<SitterProfilePublic | null> {
  const fk = SITTER_PROFILES_USER_COLUMN;
  const fullSelect =
    "id, first_name, last_name, bio, hourly_rate_nis, pricing_model, package_price_nis, service_types, certifications, years_experience, nanny_serial, nanny_id_number, is_public, updated_at, has_car, languages, working_cities";

  let read = safeSupabaseRead(
    await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(fullSelect)
      .eq(fk, sitterId)
      .eq("is_public", true)
      .maybeSingle(),
    "sitter profile direct"
  );

  if (read.error) {
    read = safeSupabaseRead(
      await supabase
        .from(SITTER_PROFILES_TABLE)
        .select("id, first_name, last_name, bio, hourly_rate_nis, pricing_model, package_price_nis, years_experience, is_public, updated_at")
        .eq(fk, sitterId)
        .eq("is_public", true)
        .maybeSingle(),
      "sitter profile direct with pricing"
    );
  }

  if (read.error || !read.data) {
    return null;
  }

  const profileData = {
    ...(read.data as Record<string, unknown>)
  };

  const { data: mainProfile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", sitterId)
    .maybeSingle();

  if (mainProfile?.avatar_url) {
    profileData.avatar_url = mainProfile.avatar_url;
  }

  return normalizeSitterProfilePublic(profileData, sitterId);
}

export async function fetchParentSitterProfile(
  supabase: SupabaseClient,
  sitterId: string
): Promise<ParentSitterProfileLoadResult> {
  let profile = await fetchSitterProfileDirect(supabase, sitterId);

  if (!profile) {
    const { data: profileJson, error: profErr } = await supabase.rpc("get_sitter_profile_public", {
      target_id: sitterId
    });

    if (!profErr) {
      const parsed = unwrapRpcProfilePayload(profileJson) ?? parseRpcJson(profileJson);
      if (parsed) {
        profile = normalizeSitterProfilePublic(parsed, sitterId);
        if (profile.is_public === false) {
          profile = null;
        }
      }
    }
  }

  if (!profile) {
    return { profile: null, reviews: [], error: null };
  }

  const [reviews, ratingSummary] = await Promise.all([
    fetchSitterPublicReviews(supabase, sitterId, 10),
    fetchUserRatingSummary(supabase, sitterId)
  ]);

  // Authoritative published ratings (same source as the ratings system).
  // Direct sitter_profiles select does not include avg_rating/rating_count.
  if (ratingSummary.count > 0 && ratingSummary.average > 0) {
    profile = {
      ...profile,
      avg_rating: ratingSummary.average,
      rating_count: ratingSummary.count
    };
  } else {
    profile = {
      ...profile,
      avg_rating: null,
      rating_count: 0
    };
  }

  return { profile, reviews, error: null };
}

export type ParentSitterProfileLoadResult = {
  profile: SitterProfilePublic | null;
  reviews: PublicSitterReview[];
  error: string | null;
};