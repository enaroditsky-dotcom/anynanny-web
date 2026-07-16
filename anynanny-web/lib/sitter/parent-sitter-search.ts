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
  "full_name, show_full_name, nanny_serial, nanny_id_number, years_experience, has_car, bio, hourly_rate_nis, working_cities";

function normalizeStoredSerial(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function resolveSitterUserId(row: Record<string, unknown>): string | null {
  const fk = getSitterProfilesUserColumn();
  const fromFk = row[fk];
  if (typeof fromFk === "string" && fromFk.trim()) return fromFk.trim();
  if (typeof row.id === "string" && row.id.trim()) return row.id.trim();
  return null;
}

function canonicalPublicSerial(row: Record<string, unknown>): string | null {
  const serial = typeof row.nanny_serial === "string" ? row.nanny_serial.trim() : "";
  return serial || null;
}

function profileRowToSearchCard(row: Record<string, unknown>): PublicSitterSearchCard | null {
  const card = normalizePublicSearchCard(row);
  if (!card) return null;
  const fullName = card.full_name?.trim() ?? "";
  const showFull = row.show_full_name === true;
  const displayFromName = showFull ? fullName : fullName.split(/\s+/)[0]?.trim() ?? "";
  const nannySerial = canonicalPublicSerial(row);
  return { ...card, display_name: displayFromName || card.display_name, nanny_serial: nannySerial || card.nanny_serial, avatar_url: card.avatar_url ?? null };
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
    if (isDisplayableSearchRating(card.avg_rating)) return card;
    const fk = getSitterProfilesUserColumn();
    const direct = await supabase.from(SITTER_PROFILES_TABLE).select(`${fk}, avg_rating, working_cities, nanny_serial, full_name`).eq(fk, card.id).maybeSingle();
    if (!direct.error && direct.data) {
      const row = direct.data as Record<string, unknown>;
      const avg = parseAvgRatingValue(row.avg_rating);
      if (isDisplayableSearchRating(avg)) return { ...card, avg_rating: avg, working_cities: normalizeWorkingCities(row.working_cities ?? card.working_cities) };
    }
    const { data, error } = await supabase.rpc("get_sitter_profile_public", { target_id: card.id });
    if (error || !data) return card;
    const payload = unwrapRpcProfilePayload(data);
    if (!payload) return card;
    const profile = normalizeSitterProfilePublic(payload, card.id);
    return isDisplayableSearchRating(profile.avg_rating) ? { ...card, avg_rating: profile.avg_rating ?? null, rating_count: profile.rating_count ?? 0, working_cities: profile.working_cities?.length ? profile.working_cities : card.working_cities } : card;
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

// --- הפונקציה המתוקנת ---
async function invokeListPublicSittersSearchRpc(supabase: SupabaseClient, filters: ParentSearchFilters): Promise<{ data: unknown; error: unknown }> {
  const args = toListPublicSittersSearchRpcArgs(filters);
  const cleanArgs = { ...args };
  // מחיקת שדות דירוג שלא קיימים ב-RPC המעודכן
  delete (cleanArgs as any).min_rating;
  delete (cleanArgs as any).rating;

  const read = await safeSupabaseReadAsync(() => supabase.rpc("list_public_sitters_search", cleanArgs), "list_public_sitters_search");
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

async function enrichSearchCardsWithRatings(supabase: SupabaseClient, cards: PublicSitterSearchCard[], filters: ParentSearchFilters, options?: DirectSearchOptions): Promise<PublicSitterSearchCard[]> {
  return ensureSearchCardRatings(supabase, cards, filters, options);
}

async function runBrowseParentSitterSearchDirect(supabase: SupabaseClient, filters: ParentSearchFilters, options?: DirectSearchOptions): Promise<ParentSitterSearchResult> {
  const safe = normalizeParentSearchFilters(filters);
  const userColumn = getSitterProfilesUserColumn();
  let query = supabase.from(SITTER_PROFILES_TABLE).select(`${userColumn}, ${SERIAL_SELECT_BASE}`).eq("is_public", true);
  const { data, error } = await query;
  if (error) return { cards: [], error: error.message };
  const cards = (data ?? []).map((r) => profileRowToSearchCard(r as any)).filter((c): c is PublicSitterSearchCard => c != null);
  return { cards: await enrichSearchCardsWithRatings(supabase, cards, safe, options), error: null };
}

async function fetchPublicSitterBySerialDirect(supabase: SupabaseClient, serial: string, options?: DirectSearchOptions): Promise<ParentSitterSearchResult> {
  const { data, error } = await supabase.from(SITTER_PROFILES_TABLE).select(`${getSitterProfilesUserColumn()}, ${SERIAL_SELECT_BASE}`).eq("is_public", true).eq("nanny_serial", serial).limit(1);
  if (error) return { cards: [], error: error.message };
  const cards = (data ?? []).filter((r) => rowMatchesSerial(r as any, serial)).map((r) => profileRowToSearchCard(r as any)).filter((c): c is PublicSitterSearchCard => c != null);
  return finalizeSerialSearchResults(await enrichSearchCardsWithRatings(supabase, cards, normalizeParentSearchFilters({ searchSitterSerial: serial }), options), serial);
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