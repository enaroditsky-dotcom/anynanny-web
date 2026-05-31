import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSerialTargetedSearch,
  minYearsExperienceToRpcValue,
  normalizeParentSearchFilters,
  normalizeSitterSerialForLookup,
  PARENT_SEARCH_MAX_HOURLY_SLIDER,
  toListPublicSittersSearchRpcArgs,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import { parsePublicSearchCards, normalizePublicSearchCard, isDisplayableSearchRating } from "@/lib/sitter/public-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";
import {
  normalizeSitterProfilePublic,
  unwrapRpcProfilePayload
} from "@/lib/sitter/fetch-parent-sitter-profile";
import { isPostgrestMissingColumnError, isPostgrestMissingFunctionError } from "@/lib/supabase/postgrest-schema";
import {
  getSitterProfilesUserColumn,
  SITTER_PROFILES_TABLE,
  SITTER_WORKING_CITIES_COLUMN
} from "@/lib/sitter/sitter-profile";

export type ParentSitterSearchResult = {
  cards: PublicSitterSearchCard[];
  error: string | null;
};

/** Core public profile columns — ratings come from `list_public_sitters_search` (aggregates `public.ratings`). */
const SERIAL_SELECT_BASE =
  "full_name, show_full_name, nanny_serial, nanny_id_number, years_experience, has_car, bio, hourly_rate_nis, working_cities";

function normalizeStoredSerial(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Resolve auth user id from sitter_profiles (id or user_id per env). */
function resolveSitterUserId(row: Record<string, unknown>): string | null {
  const fk = getSitterProfilesUserColumn();
  const fromFk = row[fk];
  if (typeof fromFk === "string" && fromFk.trim()) return fromFk.trim();
  if (typeof row.id === "string" && row.id.trim()) return row.id.trim();
  return null;
}

/** Canonical public serial for display — `nanny_serial` only (not legacy `nanny_id_number`). */
function canonicalPublicSerial(row: Record<string, unknown>): string | null {
  const serial = typeof row.nanny_serial === "string" ? row.nanny_serial.trim() : "";
  return serial || null;
}

function profileRowToSearchCard(row: Record<string, unknown>): PublicSitterSearchCard | null {
  const card = normalizePublicSearchCard(row);
  if (!card) return null;

  const fullName = card.full_name?.trim() ?? "";
  const showFull = row.show_full_name === true;
  const displayFromName = showFull
    ? fullName
    : fullName.split(/\s+/)[0]?.trim() ?? "";

  const nannySerial = canonicalPublicSerial(row);

  return {
    ...card,
    display_name: displayFromName || card.display_name,
    nanny_serial: nannySerial || card.nanny_serial,
    avatar_url: card.avatar_url ?? null
  };
}

/** Serial lookup matches `nanny_serial` only — avoids false hits on mirrored `nanny_id_number`. */
function rowMatchesSerial(row: Record<string, unknown>, serial: string): boolean {
  const target = normalizeStoredSerial(serial);
  const stored = normalizeStoredSerial(row.nanny_serial);
  return stored.length > 0 && stored === target;
}

function cardMatchesExactSerial(card: PublicSitterSearchCard, serial: string): boolean {
  return normalizeStoredSerial(card.nanny_serial) === normalizeStoredSerial(serial);
}

/** One public serial → at most one sitter (exact `nanny_serial` only). */
function finalizeSerialSearchResults(
  cards: PublicSitterSearchCard[],
  serial: string
): ParentSitterSearchResult {
  const exact = cards.filter((c) => cardMatchesExactSerial(c, serial));
  const byUser = new Map<string, PublicSitterSearchCard>();
  for (const card of exact) {
    byUser.set(card.id, card);
  }
  const unique = [...byUser.values()];
  return { cards: unique.slice(0, 1), error: null };
}

function mergeRatingsOntoCards(
  cards: PublicSitterSearchCard[],
  ratingSource: PublicSitterSearchCard[]
): PublicSitterSearchCard[] {
  if (cards.length === 0 || ratingSource.length === 0) return cards;

  const byId = new Map(
    ratingSource.map((c) => [
      c.id,
      { avg_rating: c.avg_rating, rating_count: c.rating_count }
    ])
  );

  return cards.map((card) => {
    const ratings = byId.get(card.id);
    if (!ratings) return card;
    if (!isDisplayableSearchRating(ratings.avg_rating)) return card;
    return { ...card, ...ratings };
  });
}

function stripInvalidSearchRatings(cards: PublicSitterSearchCard[]): PublicSitterSearchCard[] {
  return cards.map((card) => {
    if (isDisplayableSearchRating(card.avg_rating)) return card;
    return { ...card, avg_rating: null, rating_count: 0 };
  });
}

function parseAvgRatingValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 0 ? raw : null;
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Same RPC as parent profile page — authoritative `avg_rating` / `rating_count`. */
async function enrichSearchCardsWithProfilePublicRpc(
  supabase: SupabaseClient,
  cards: PublicSitterSearchCard[]
): Promise<PublicSitterSearchCard[]> {
  if (cards.length === 0) return cards;

  return Promise.all(
    cards.map(async (card) => {
      if (isDisplayableSearchRating(card.avg_rating)) return card;

      const fk = getSitterProfilesUserColumn();
      const direct = await supabase
        .from(SITTER_PROFILES_TABLE)
        .select(`${fk}, avg_rating, working_cities, nanny_serial, full_name`)
        .eq(fk, card.id)
        .maybeSingle();

      if (!direct.error && direct.data) {
        const row = direct.data as Record<string, unknown>;
        const avg = parseAvgRatingValue(row.avg_rating);
        if (isDisplayableSearchRating(avg)) {
          return {
            ...card,
            avg_rating: avg,
            working_cities: normalizeWorkingCities(row.working_cities ?? card.working_cities)
          };
        }
      }

      const { data, error } = await supabase.rpc("get_sitter_profile_public", {
        target_id: card.id
      });
      if (error) {
        if (isPostgrestMissingFunctionError(error.message)) return card;
        return card;
      }

      const payload = unwrapRpcProfilePayload(data);
      if (!payload) return card;

      const profile = normalizeSitterProfilePublic(payload, card.id);
      if (!isDisplayableSearchRating(profile.avg_rating)) return card;

      return {
        ...card,
        avg_rating: profile.avg_rating ?? null,
        rating_count: profile.rating_count ?? 0,
        working_cities:
          profile.working_cities?.length ? profile.working_cities : card.working_cities
      };
    })
  );
}

async function ensureSearchCardRatings(
  supabase: SupabaseClient,
  cards: PublicSitterSearchCard[],
  filters: ParentSearchFilters,
  options?: DirectSearchOptions
): Promise<PublicSitterSearchCard[]> {
  let result = stripInvalidSearchRatings(cards);

  if (!options?.skipListRpcEnrich) {
    const { data, error } = await supabase.rpc(
      "list_public_sitters_search",
      toListPublicSittersSearchRpcArgs(filters)
    );
    if (!error) {
      result = mergeRatingsOntoCards(result, parsePublicSearchCards(data));
    }
  }

  if (!result.some((c) => isDisplayableSearchRating(c.avg_rating))) {
    result = await enrichSearchCardsWithAvgRatingColumn(supabase, result);
  }

  return enrichSearchCardsWithWorkingCities(
    supabase,
    await enrichSearchCardsWithProfilePublicRpc(supabase, result)
  );
}

function isRpcRatingSchemaError(message: string): boolean {
  return (
    isPostgrestMissingColumnError(message, "rating_count") ||
    isPostgrestMissingColumnError(message, "avg_rating")
  );
}

function shouldFallbackBrowseFromRpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    isPostgrestMissingFunctionError(message) ||
    lower.includes("is_available") ||
    lower.includes("list_public_sitters_no_is_available") ||
    lower.includes("could not find the function") ||
    lower.includes("function public.list_public_sitters_search") ||
    lower.includes("p_search_city") ||
    lower.includes("working_cities") ||
    isRpcRatingSchemaError(message)
  );
}

type DirectSearchOptions = {
  /** Skip list RPC enrich when the deployed RPC references missing sitter_profiles rating columns. */
  skipListRpcEnrich?: boolean;
};

/** Read cached avg only — never selects sitter_profiles.rating_count. */
async function enrichSearchCardsWithAvgRatingColumn(
  supabase: SupabaseClient,
  cards: PublicSitterSearchCard[]
): Promise<PublicSitterSearchCard[]> {
  if (cards.length === 0) return cards;

  const fk = getSitterProfilesUserColumn();
  const ids = cards.map((c) => c.id);
  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(`${fk}, avg_rating`)
    .in(fk, ids);

  if (error) {
    if (isPostgrestMissingColumnError(error.message, "avg_rating")) return cards;
    return cards;
  }

  const avgById = new Map<string, number>();
  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const key = typeof record[fk] === "string" ? record[fk] : null;
    if (!key) continue;
    const avg = parseAvgRatingValue(record.avg_rating);
    if (avg != null) {
      avgById.set(key, avg);
    }
  }

  return cards.map((card) => {
    const avg = avgById.get(card.id);
    if (avg == null) return card;
    return { ...card, avg_rating: avg };
  });
}

async function enrichSearchCardsWithWorkingCities(
  supabase: SupabaseClient,
  cards: PublicSitterSearchCard[]
): Promise<PublicSitterSearchCard[]> {
  const missing = cards.filter((card) => !card.working_cities?.length);
  if (missing.length === 0) return cards;

  const fk = getSitterProfilesUserColumn();
  const ids = missing.map((card) => card.id);
  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(`${fk}, ${SITTER_WORKING_CITIES_COLUMN}`)
    .in(fk, ids);

  if (error) {
    if (isPostgrestMissingColumnError(error.message, SITTER_WORKING_CITIES_COLUMN)) {
      return cards;
    }
    return cards;
  }

  const citiesById = new Map<string, PublicSitterSearchCard["working_cities"]>();
  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const key = typeof record[fk] === "string" ? record[fk] : null;
    if (!key) continue;
    const cities = normalizeWorkingCities(record[SITTER_WORKING_CITIES_COLUMN]);
    if (cities.length) citiesById.set(key, cities);
  }

  return cards.map((card) => {
    const cities = citiesById.get(card.id);
    if (!cities?.length) return card;
    return { ...card, working_cities: cities };
  });
}

/** Attach ratings via list RPC, profile column, then profile RPC (same source as profile page). */
async function enrichSearchCardsWithRatings(
  supabase: SupabaseClient,
  cards: PublicSitterSearchCard[],
  filters: ParentSearchFilters,
  options?: DirectSearchOptions
): Promise<PublicSitterSearchCard[]> {
  return ensureSearchCardRatings(supabase, cards, filters, options);
}

/** Browse/filter search without RPC — used when `list_public_sitters_search` is missing or outdated. */
async function runBrowseParentSitterSearchDirect(
  supabase: SupabaseClient,
  filters: ParentSearchFilters,
  options?: DirectSearchOptions
): Promise<ParentSitterSearchResult> {
  const safe = normalizeParentSearchFilters(filters);
  const userColumn = getSitterProfilesUserColumn();
  const selectCols = `${userColumn}, ${SERIAL_SELECT_BASE}`;

  const minYears = minYearsExperienceToRpcValue(safe.minYearsExperience);
  let query = supabase.from(SITTER_PROFILES_TABLE).select(selectCols).eq("is_public", true);
  if (minYears > 0) {
    query = query.gte("years_experience", minYears);
  }
  if (safe.selectedCity) {
    query = query.contains(SITTER_WORKING_CITIES_COLUMN, [safe.selectedCity]);
  }

  const { data, error } = await query;
  if (error) {
    return { cards: [], error: error.message };
  }

  let rows = (data ?? []) as unknown as Record<string, unknown>[];

  if (safe.maxHourlyRate < PARENT_SEARCH_MAX_HOURLY_SLIDER) {
    rows = rows.filter((row) => {
      const rate = row.hourly_rate_nis;
      return rate == null || (typeof rate === "number" && rate <= safe.maxHourlyRate);
    });
  }

  if (safe.transport === "self") {
    rows = rows.filter((row) => row.has_car === true);
  } else if (safe.transport === "taxi") {
    rows = rows.filter((row) => row.has_car !== true);
  }

  const cards = rows
    .map((row) => profileRowToSearchCard(row))
    .filter((c): c is PublicSitterSearchCard => c != null);

  const enriched = await enrichSearchCardsWithRatings(supabase, cards, safe, options);
  return { cards: enriched, error: null };
}

async function fetchPublicSitterBySerialDirect(
  supabase: SupabaseClient,
  serial: string,
  options?: DirectSearchOptions
): Promise<ParentSitterSearchResult> {
  const userColumn = getSitterProfilesUserColumn();
  const selectCols = `${userColumn}, ${SERIAL_SELECT_BASE}`;

  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(selectCols)
    .eq("is_public", true)
    .eq("nanny_serial", serial)
    .limit(1);

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("nanny_serial")) {
      return {
        cards: [],
        error: "עמודות מזהה נני לא נמצאו — ודאו שהמיגרציה האחרונה רצה ב-Supabase."
      };
    }
    return { cards: [], error: error.message };
  }

  const cards = (data ?? [])
    .filter((row) => rowMatchesSerial(row as unknown as Record<string, unknown>, serial))
    .map((row) => profileRowToSearchCard(row as unknown as Record<string, unknown>))
    .filter((c): c is PublicSitterSearchCard => c != null);

  const enriched = await enrichSearchCardsWithRatings(
    supabase,
    cards,
    normalizeParentSearchFilters({ searchSitterSerial: serial }),
    options
  );

  return finalizeSerialSearchResults(enriched, serial);
}

/**
 * Lookup by public nanny serial (AN-####) — RPC first (aggregates public.ratings),
 * then direct profile read without sitter_profiles rating columns.
 */
export async function fetchPublicSitterSearchBySerial(
  supabase: SupabaseClient,
  serialInput: string
): Promise<ParentSitterSearchResult> {
  const serial = normalizeSitterSerialForLookup(serialInput);
  if (!serial) {
    return { cards: [], error: null };
  }

  const rpcResult = await runListPublicSittersSearchRpc(supabase, {
    ...normalizeParentSearchFilters({ searchSitterSerial: serial })
  });

  if (!rpcResult.error && rpcResult.cards.length > 0) {
    const rated = await ensureSearchCardRatings(supabase, rpcResult.cards, {
      ...normalizeParentSearchFilters({ searchSitterSerial: serial })
    }, { skipListRpcEnrich: true });
    return finalizeSerialSearchResults(rated, serial);
  }

  const skipListRpcEnrich =
    rpcResult.error != null && isRpcRatingSchemaError(rpcResult.error);

  return fetchPublicSitterBySerialDirect(supabase, serial, { skipListRpcEnrich });
}

export async function runListPublicSittersSearchRpc(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  const args = toListPublicSittersSearchRpcArgs(filters);

  const { data: results, error } = await supabase.rpc("list_public_sitters_search", args);

  if (error) {
    const msg = error.message ?? "";
    if (shouldFallbackBrowseFromRpcError(msg)) {
      return runBrowseParentSitterSearchDirect(supabase, filters, {
        skipListRpcEnrich: isRpcRatingSchemaError(msg)
      });
    }
    return { cards: [], error: msg || "שגיאה בביצוע החיפוש" };
  }

  return {
    cards: await ensureSearchCardRatings(supabase, parsePublicSearchCards(results), filters, {
      skipListRpcEnrich: true
    }),
    error: null
  };
}

/** Serial (AN-####) → RPC + direct profile lookup; browse → filtered RPC. */
export async function runParentSitterSearch(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  if (isSerialTargetedSearch(filters)) {
    return fetchPublicSitterSearchBySerial(supabase, filters.searchSitterSerial);
  }

  return runListPublicSittersSearchRpc(supabase, filters);
}
