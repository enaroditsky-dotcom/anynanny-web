import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSerialTargetedSearch,
  normalizeParentSearchFilters,
  normalizeSitterSerialForLookup,
  toListPublicSittersSearchRpcArgs,
  buildSearchEndTimeIso,
  buildSearchStartTimeIso,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import { parsePublicSearchCards, isDisplayableSearchRating } from "@/lib/sitter/public-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  normalizeSitterProfilePublic,
  unwrapRpcProfilePayload
} from "@/lib/sitter/fetch-parent-sitter-profile";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";
import { safeSupabaseReadAsync } from "@/lib/supabase/safe-supabase-read";

export type ParentSitterSearchResult = {
  cards: PublicSitterSearchCard[];
  error: string | null;
};

function normalizeStoredSerial(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function cardMatchesExactSerial(card: PublicSitterSearchCard, serial: string): boolean {
  return normalizeStoredSerial(card.nanny_serial) === normalizeStoredSerial(serial);
}

function finalizeSerialSearchResults(cards: PublicSitterSearchCard[], serial: string): ParentSitterSearchResult {
  const exact = cards.filter((c) => cardMatchesExactSerial(c, serial));
  const unique = Array.from(new Map(exact.map((c) => [c.id, c])).values());
  return { cards: unique.slice(0, 1), error: null };
}

function mergeRatingsOntoCards(
  cards: PublicSitterSearchCard[],
  ratingSource: PublicSitterSearchCard[]
): PublicSitterSearchCard[] {
  if (cards.length === 0 || ratingSource.length === 0) return cards;
  const byId = new Map(
    ratingSource.map((c) => [c.id, { avg_rating: c.avg_rating, rating_count: c.rating_count }])
  );
  return cards.map((card) => {
    const ratings = byId.get(card.id);
    if (!ratings || !isDisplayableSearchRating(ratings.avg_rating)) return card;
    return { ...card, ...ratings };
  });
}

function stripInvalidSearchRatings(cards: PublicSitterSearchCard[]): PublicSitterSearchCard[] {
  return cards.map((card) =>
    isDisplayableSearchRating(card.avg_rating) ? card : { ...card, avg_rating: null, rating_count: 0 }
  );
}

async function enrichSearchCardsWithProfilePublicRpc(
  supabase: SupabaseClient,
  cards: PublicSitterSearchCard[]
): Promise<PublicSitterSearchCard[]> {
  if (cards.length === 0) return cards;
  return Promise.all(
    cards.map(async (card) => {
      const needsRating = !isDisplayableSearchRating(card.avg_rating);
      const needsPrice =
        card.pricing_model == null ||
        (card.pricing_model === "package"
          ? card.package_price_nis == null
          : card.hourly_rate_nis == null);
      const needsLanguages = !String(card.languages ?? "").trim();
      const needsCertifications = !String(card.certifications ?? "").trim();
      const needsCities = !card.working_cities?.length;
      if (!needsRating && !needsPrice && !needsLanguages && !needsCertifications && !needsCities) {
        return card;
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
        languages: profile.languages || card.languages,
        certifications: profile.certifications || card.certifications,
        years_experience: profile.years_experience ?? card.years_experience,
        avg_rating: isDisplayableSearchRating(profile.avg_rating)
          ? profile.avg_rating ?? null
          : card.avg_rating,
        rating_count: isDisplayableSearchRating(profile.avg_rating)
          ? profile.rating_count ?? 0
          : card.rating_count,
        working_cities: profile.working_cities?.length ? profile.working_cities : card.working_cities
      };
    })
  );
}

async function ensureSearchCardRatings(
  supabase: SupabaseClient,
  cards: PublicSitterSearchCard[],
  filters: ParentSearchFilters,
  options?: { skipListRpcEnrich?: boolean }
): Promise<PublicSitterSearchCard[]> {
  let result = stripInvalidSearchRatings(cards);
  if (!options?.skipListRpcEnrich) {
    try {
      const { data, error } = await invokeListPublicSittersSearchRpc(supabase, filters);
      if (!error && data != null) result = mergeRatingsOntoCards(result, parsePublicSearchCards(data));
    } catch {
      console.warn("[parent-sitter-search] enrich skipped");
    }
  }
  return enrichSearchCardsWithProfilePublicRpc(supabase, result);
}

async function invokeListPublicSittersSearchRpc(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<{ data: unknown; error: unknown }> {
  const args = toListPublicSittersSearchRpcArgs(filters);
  let cleanArgs = { ...args } as Record<string, unknown>;
  delete cleanArgs.min_rating;
  delete cleanArgs.rating;

  const read = await safeSupabaseReadAsync(
    () => supabase.rpc("list_public_sitters_search", cleanArgs),
    "list_public_sitters_search"
  );

  if (read.error) {
    const message = readSupabaseErrorMessage(read.error).toLowerCase();
    if (message.includes("p_verified_only") || message.includes("verified_only")) {
      const { p_verified_only: _ignoredVerified, ...withoutVerified } = cleanArgs;
      const retry = await safeSupabaseReadAsync(
        () => supabase.rpc("list_public_sitters_search", withoutVerified),
        "list_public_sitters_search"
      );
      if (!retry.error) return { data: retry.data, error: retry.error };
      cleanArgs = withoutVerified as Record<string, unknown>;
    }
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

function hasRequestedTimeWindow(filters: ParentSearchFilters): boolean {
  return Boolean(buildSearchStartTimeIso(filters) && buildSearchEndTimeIso(filters));
}

async function fetchPublicSitterBySerialViaRpc(
  supabase: SupabaseClient,
  serial: string,
  contextFilters?: Partial<ParentSearchFilters>
): Promise<ParentSitterSearchResult> {
  const filters = normalizeParentSearchFilters({
    ...contextFilters,
    searchSitterSerial: serial
  });
  const rpcResult = await runListPublicSittersSearchRpc(supabase, filters);
  if (rpcResult.error) return rpcResult;
  const rated = await ensureSearchCardRatings(supabase, rpcResult.cards, filters, {
    skipListRpcEnrich: true
  });
  return finalizeSerialSearchResults(rated, serial);
}

export async function fetchPublicSitterSearchBySerial(
  supabase: SupabaseClient,
  serialInput: string,
  contextFilters?: Partial<ParentSearchFilters>
): Promise<ParentSitterSearchResult> {
  const serial = normalizeSitterSerialForLookup(serialInput);
  if (!serial) return { cards: [], error: null };
  return fetchPublicSitterBySerialViaRpc(supabase, serial, contextFilters);
}

export async function runListPublicSittersSearchRpc(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  try {
    const { data: results, error } = await invokeListPublicSittersSearchRpc(supabase, filters);
    if (error) {
      return { cards: [], error: readSupabaseErrorMessage(error) || "שגיאה בביצוע החיפוש" };
    }
    return {
      cards: await ensureSearchCardRatings(supabase, parsePublicSearchCards(results), filters, {
        skipListRpcEnrich: true
      }),
      error: null
    };
  } catch (e) {
    return { cards: [], error: readSupabaseErrorMessage(e) || "שגיאה בביצוע החיפוש" };
  }
}

export async function runParentSitterSearch(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  if (isSerialTargetedSearch(filters) && !hasRequestedTimeWindow(filters)) {
    return fetchPublicSitterSearchBySerial(supabase, filters.searchSitterSerial, filters);
  }
  return runListPublicSittersSearchRpc(supabase, filters);
}

/** Used by dashboard preview cards — same public RPC, no table scan. */
export async function listPublicSittersForDashboard(
  supabase: SupabaseClient
): Promise<PublicSitterSearchCard[]> {
  const serviceTypes = [
    "babysitter",
    "sleep_consultant",
    "lactation_consultant",
    "doula"
  ] as const;
  const results = await Promise.all(
    serviceTypes.map((serviceType) =>
      runListPublicSittersSearchRpc(supabase, normalizeParentSearchFilters({ serviceType }))
    )
  );
  const byId = new Map<string, PublicSitterSearchCard>();
  for (const result of results) {
    if (result.error) {
      console.warn("[parent-dashboard] list_public_sitters_search:", result.error);
      continue;
    }
    for (const card of result.cards) {
      if (!byId.has(card.id)) byId.set(card.id, card);
    }
  }
  return Array.from(byId.values());
}
