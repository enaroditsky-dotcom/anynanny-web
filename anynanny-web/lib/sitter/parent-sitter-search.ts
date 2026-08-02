import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSerialTargetedSearch,
  normalizeParentSearchFilters,
  normalizeSitterSerialForLookup,
  toListPublicSittersSearchRpcArgs,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import { parsePublicSearchCards, normalizePublicSearchCard, isDisplayableSearchRating } from "@/lib/sitter/public-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import { normalizeWorkingCities, type IsraelCity } from "@/lib/geo/israel-cities";
import {
  normalizeSitterProfilePublic,
  unwrapRpcProfilePayload
} from "@/lib/sitter/fetch-parent-sitter-profile";
import {
  isPostgrestMissingColumnError,
  isPostgrestMissingFunctionError,
  isSupabaseRpcUnavailableError,
  readSupabaseErrorMessage
} from "@/lib/supabase/postgrest-schema";
import { safeSupabaseReadAsync } from "@/lib/supabase/safe-supabase-read";
import {
  getSitterProfilesUserColumn,
  SITTER_PROFILES_TABLE,
  SITTER_WORKING_CITIES_COLUMN
} from "@/lib/sitter/sitter-profile";

export type ParentSitterSearchResult = {
  cards: PublicSitterSearchCard[];
  error: string | null;
};

const SERIAL_SELECT_BASE =
  "first_name, last_name, nanny_serial, nanny_id_number, years_experience, has_car, bio, hourly_rate_nis, pricing_model, package_price_nis, working_cities";
const SERIAL_SELECT_MINIMAL =
  "first_name, last_name, nanny_serial, nanny_id_number, years_experience, has_car, bio, hourly_rate_nis, working_cities";

function normalizeStoredSerial(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function canonicalPublicSerial(row: Record<string, unknown>): string | null {
  const serial = typeof row.nanny_serial === "string" ? row.nanny_serial.trim() : "";
  return serial || null;
}

function profileRowToSearchCard(row: Record<string, unknown>): PublicSitterSearchCard | null {
  const card = normalizePublicSearchCard(row);
  if (!card) return null;

  const first = String(row.first_name ?? "").trim();
  const last = String(row.last_name ?? "").trim();
  const combined = `${first} ${last}`.trim();

  const displayFromName = first || combined;
  const nannySerial = canonicalPublicSerial(row);

  return {
    ...card,
    first_name: first || card.first_name,
    last_name: last || card.last_name,
    display_name: displayFromName || card.display_name,
    nanny_serial: nannySerial || card.nanny_serial,
    avatar_url: card.avatar_url ?? null
  };
}

function rowMatchesSerial(row: Record<string, unknown>, serial: string): boolean {
  return normalizeStoredSerial(row.nanny_serial) === normalizeStoredSerial(serial);
}

function cardMatchesExactSerial(card: PublicSitterSearchCard, serial: string): boolean {
  return normalizeStoredSerial(card.nanny_serial) === normalizeStoredSerial(serial);
}

function finalizeSerialSearchResults(cards: PublicSitterSearchCard[], serial: string): ParentSitterSearchResult {
  const exact = cards.filter((c) => cardMatchesExactSerial(c, serial));
  const unique = Array.from(new Map(exact.map(c => [c.id, c])).values());
  return { cards: unique.slice(0, 1), error: null };
}

function mergeRatingsOntoCards(cards: PublicSitterSearchCard[], ratingSource: PublicSitterSearchCard[]): PublicSitterSearchCard[] {
  if (cards.length === 0 || ratingSource.length === 0) return cards;
  const byId = new Map(ratingSource.map((c) => [c.id, { avg_rating: c.avg_rating, rating_count: c.rating_count }]));
  return cards.map((card) => {
    const ratings = byId.get(card.id);
    if (!ratings || !isDisplayableSearchRating(ratings.avg_rating)) return card;
    return { ...card, ...ratings };
  });
}

function stripInvalidSearchRatings(cards: PublicSitterSearchCard[]): PublicSitterSearchCard[] {
  return cards.map((card) => isDisplayableSearchRating(card.avg_rating) ? card : { ...card, avg_rating: null, rating_count: 0 });
}

function parseAvgRatingValue(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 0 ? raw : null;
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function enrichSearchCardsWithProfilePublicRpc(supabase: SupabaseClient, cards: PublicSitterSearchCard[]): Promise<PublicSitterSearchCard[]> {
  if (cards.length === 0) return cards;
  return Promise.all(cards.map(async (card) => {
    const needsRating = !isDisplayableSearchRating(card.avg_rating);
    const needsPrice =
      card.pricing_model == null ||
      (card.pricing_model === "package"
        ? card.package_price_nis == null
        : card.hourly_rate_nis == null);
    if (!needsRating && !needsPrice) return card;

    const fk = getSitterProfilesUserColumn();
    const direct = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(
        `${fk}, avg_rating, working_cities, nanny_serial, first_name, last_name, hourly_rate_nis, pricing_model, package_price_nis, service_types`
      )
      .eq(fk, card.id)
      .maybeSingle();
    if (!direct.error && direct.data) {
      const row = direct.data as Record<string, unknown>;
      const avg = parseAvgRatingValue(row.avg_rating);
      const fromRow = normalizePublicSearchCard({ ...card, ...row, id: card.id });
      return {
        ...card,
        ...(fromRow
          ? {
              pricing_model: fromRow.pricing_model,
              package_price_nis: fromRow.package_price_nis,
              hourly_rate_nis: fromRow.hourly_rate_nis ?? card.hourly_rate_nis,
              service_types: fromRow.service_types ?? card.service_types
            }
          : {}),
        avg_rating: isDisplayableSearchRating(avg) ? avg : card.avg_rating,
        working_cities: normalizeWorkingCities(row.working_cities ?? card.working_cities)
      };
    }

    const { data, error } = await supabase.rpc("get_sitter_profile_public", { target_id: card.id });
    if (error || !data) return card;
    const payload = unwrapRpcProfilePayload(data);
    if (!payload) return card;
    const profile = normalizeSitterProfilePublic(payload, card.id);
    return {
      ...card,
      pricing_model: profile.pricing_model ?? card.pricing_model,
      package_price_nis: profile.package_price_nis ?? card.package_price_nis,
      hourly_rate_nis: profile.hourly_rate_nis ?? card.hourly_rate_nis,
      service_types: profile.service_types ?? card.service_types,
      avg_rating: isDisplayableSearchRating(profile.avg_rating) ? profile.avg_rating ?? null : card.avg_rating,
      rating_count: isDisplayableSearchRating(profile.avg_rating)
        ? profile.rating_count ?? 0
        : card.rating_count,
      working_cities: profile.working_cities?.length ? profile.working_cities : card.working_cities
    };
  }));
}

async function ensureSearchCardRatings(supabase: SupabaseClient, cards: PublicSitterSearchCard[], filters: ParentSearchFilters, options?: DirectSearchOptions): Promise<PublicSitterSearchCard[]> {
  let result = stripInvalidSearchRatings(cards);
  if (!options?.skipListRpcEnrich) {
    try {
      const { data, error } = await invokeListPublicSittersSearchRpc(supabase, filters);
      if (!error && data != null) result = mergeRatingsOntoCards(result, parsePublicSearchCards(data));
    } catch (e) { console.warn("[parent-sitter-search] enrich skipped"); }
  }
  if (!result.some((c) => isDisplayableSearchRating(c.avg_rating))) result = await enrichSearchCardsWithAvgRatingColumn(supabase, result);
  return enrichSearchCardsWithWorkingCities(supabase, await enrichSearchCardsWithProfilePublicRpc(supabase, result));
}

function isRpcRatingSchemaError(message: string): boolean {
  return isPostgrestMissingColumnError(message, "rating_count") || isPostgrestMissingColumnError(message, "avg_rating");
}

function shouldFallbackListPublicSittersRpc(error: unknown): boolean {
  if (!error) return false;
  if (isSupabaseRpcUnavailableError(error)) return true;
  const message = readSupabaseErrorMessage(error).toLowerCase();
  return (
    isPostgrestMissingFunctionError(message) ||
    message.includes("is_available") ||
    isRpcRatingSchemaError(message)
  );
}

async function invokeListPublicSittersSearchRpc(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<{ data: unknown; error: unknown }> {
  const args = toListPublicSittersSearchRpcArgs(filters);
  const cleanArgs = { ...args };
  delete (cleanArgs as { min_rating?: unknown }).min_rating;
  delete (cleanArgs as { rating?: unknown }).rating;

  const read = await safeSupabaseReadAsync(
    () => supabase.rpc("list_public_sitters_search", cleanArgs),
    "list_public_sitters_search"
  );

  // Older DBs may not have p_service_type yet — retry without it.
  if (read.error) {
    const message = readSupabaseErrorMessage(read.error).toLowerCase();
    if (message.includes("p_service_type") || message.includes("service_type")) {
      const { p_service_type: _ignored, ...legacyArgs } = cleanArgs;
      const legacy = await safeSupabaseReadAsync(
        () => supabase.rpc("list_public_sitters_search", legacyArgs),
        "list_public_sitters_search"
      );
      return { data: legacy.data, error: legacy.error };
    }
  }

  return { data: read.data, error: read.error };
}

type DirectSearchOptions = { skipListRpcEnrich?: boolean; };

async function enrichSearchCardsWithAvgRatingColumn(supabase: SupabaseClient, cards: PublicSitterSearchCard[]): Promise<PublicSitterSearchCard[]> {
  if (cards.length === 0) return cards;
  const fk = getSitterProfilesUserColumn();
  const { data, error } = await supabase.from(SITTER_PROFILES_TABLE).select(`${fk}, avg_rating`).in(fk, cards.map((c) => c.id));
  if (error) return cards;
  const avgById = new Map<string, number>();
  for (const row of (data ?? [])) {
    const record = row as Record<string, unknown>;
    const avg = parseAvgRatingValue(record.avg_rating);
    if (avg != null) avgById.set(record[fk] as string, avg);
  }
  return cards.map((c) => avgById.has(c.id) ? { ...c, avg_rating: avgById.get(c.id) } : c);
}

async function enrichSearchCardsWithWorkingCities(supabase: SupabaseClient, cards: PublicSitterSearchCard[]): Promise<PublicSitterSearchCard[]> {
  const missing = cards.filter((c) => !c.working_cities?.length);
  if (missing.length === 0) return cards;
  const fk = getSitterProfilesUserColumn();
  const { data, error } = await supabase.from(SITTER_PROFILES_TABLE).select(`${fk}, ${SITTER_WORKING_CITIES_COLUMN}`).in(fk, missing.map((c) => c.id));
  if (error) return cards;
  const citiesById = new Map<string, IsraelCity[]>();
  for (const row of (data ?? [])) {
    const record = row as Record<string, unknown>;
    const cities = normalizeWorkingCities(record[SITTER_WORKING_CITIES_COLUMN]);
    if (cities.length) citiesById.set(record[fk] as string, cities);
  }
  return cards.map((c) => citiesById.has(c.id) ? { ...c, working_cities: citiesById.get(c.id) } : c);
}

function rowOffersServiceType(row: Record<string, unknown>, serviceType: string): boolean {
  const raw = row.service_types;
  if (!Array.isArray(raw) || raw.length === 0) {
    // Legacy rows without the column default to babysitter.
    return serviceType === "babysitter";
  }
  return raw.map((v) => String(v).trim().toLowerCase()).includes(serviceType);
}

async function runBrowseParentSitterSearchDirect(
  supabase: SupabaseClient,
  filters: ParentSearchFilters,
  options?: DirectSearchOptions
): Promise<ParentSitterSearchResult> {
  const safe = normalizeParentSearchFilters(filters);
  const userColumn = getSitterProfilesUserColumn();
  const withServiceTypes = `${userColumn}, ${SERIAL_SELECT_BASE}, service_types`;
  let query = supabase.from(SITTER_PROFILES_TABLE).select(withServiceTypes).eq("is_public", true);
  let { data, error } = await query;

  if (
    error &&
    (isPostgrestMissingColumnError(error.message, "service_types") ||
      isPostgrestMissingColumnError(error.message, "pricing_model") ||
      isPostgrestMissingColumnError(error.message, "package_price_nis"))
  ) {
    const fallbackSelect = isPostgrestMissingColumnError(error.message, "pricing_model") ||
      isPostgrestMissingColumnError(error.message, "package_price_nis")
      ? `${userColumn}, ${SERIAL_SELECT_MINIMAL}`
      : `${userColumn}, ${SERIAL_SELECT_BASE}`;
    const fallback = await supabase.from(SITTER_PROFILES_TABLE).select(fallbackSelect).eq("is_public", true);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return { cards: [], error: error.message };

  const cards = (data ?? [])
    .filter((r) => rowOffersServiceType(r as Record<string, unknown>, safe.serviceType))
    .map((r) => profileRowToSearchCard(r as Record<string, unknown>))
    .filter((c): c is PublicSitterSearchCard => c != null);

  return { cards: await ensureSearchCardRatings(supabase, cards, safe, options), error: null };
}

async function fetchPublicSitterBySerialDirect(supabase: SupabaseClient, serial: string, options?: DirectSearchOptions): Promise<ParentSitterSearchResult> {
  let { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(`${getSitterProfilesUserColumn()}, ${SERIAL_SELECT_BASE}`)
    .eq("is_public", true)
    .eq("nanny_serial", serial)
    .limit(1);
  if (
    error &&
    (isPostgrestMissingColumnError(error.message, "pricing_model") ||
      isPostgrestMissingColumnError(error.message, "package_price_nis"))
  ) {
    const fallback = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(`${getSitterProfilesUserColumn()}, ${SERIAL_SELECT_MINIMAL}`)
      .eq("is_public", true)
      .eq("nanny_serial", serial)
      .limit(1);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return { cards: [], error: error.message };
  const cards = (data ?? []).filter((r) => rowMatchesSerial(r as any, serial)).map((r) => profileRowToSearchCard(r as any)).filter((c): c is PublicSitterSearchCard => c != null);
  return finalizeSerialSearchResults(await ensureSearchCardRatings(supabase, cards, normalizeParentSearchFilters({ searchSitterSerial: serial }), options), serial);
}

export async function fetchPublicSitterSearchBySerial(supabase: SupabaseClient, serialInput: string): Promise<ParentSitterSearchResult> {
  const serial = normalizeSitterSerialForLookup(serialInput);
  if (!serial) return { cards: [], error: null };
  const rpcResult = await runListPublicSittersSearchRpc(supabase, normalizeParentSearchFilters({ searchSitterSerial: serial }));
  if (!rpcResult.error && rpcResult.cards.length > 0) {
    const rated = await ensureSearchCardRatings(supabase, rpcResult.cards, normalizeParentSearchFilters({ searchSitterSerial: serial }), { skipListRpcEnrich: true });
    return finalizeSerialSearchResults(rated, serial);
  }
  return fetchPublicSitterBySerialDirect(supabase, serial, { skipListRpcEnrich: rpcResult.error != null && isRpcRatingSchemaError(readSupabaseErrorMessage(rpcResult.error)) });
}

export async function runListPublicSittersSearchRpc(supabase: SupabaseClient, filters: ParentSearchFilters): Promise<ParentSitterSearchResult> {
  try {
    const { data: results, error } = await invokeListPublicSittersSearchRpc(supabase, filters);
    if (error) {
      if (shouldFallbackListPublicSittersRpc(error)) return runBrowseParentSitterSearchDirect(supabase, filters, { skipListRpcEnrich: isRpcRatingSchemaError(readSupabaseErrorMessage(error)) });
      return { cards: [], error: readSupabaseErrorMessage(error) || "שגיאה בביצוע החיפוש" };
    }
    return { cards: await ensureSearchCardRatings(supabase, parsePublicSearchCards(results), filters, { skipListRpcEnrich: true }), error: null };
  } catch (e) {
    return runBrowseParentSitterSearchDirect(supabase, filters, { skipListRpcEnrich: isRpcRatingSchemaError(readSupabaseErrorMessage(e)) });
  }
}

export async function runParentSitterSearch(supabase: SupabaseClient, filters: ParentSearchFilters): Promise<ParentSitterSearchResult> {
  if (isSerialTargetedSearch(filters)) return fetchPublicSitterSearchBySerial(supabase, filters.searchSitterSerial);
  return runListPublicSittersSearchRpc(supabase, filters);
}