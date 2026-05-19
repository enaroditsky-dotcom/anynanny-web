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
import { parsePublicSearchCards } from "@/lib/sitter/public-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import {
  getSitterProfilesUserColumn,
  SITTER_PROFILES_TABLE
} from "@/lib/sitter/sitter-profile";

export type ParentSitterSearchResult = {
  cards: PublicSitterSearchCard[];
  error: string | null;
};

/** Core public profile columns only — no sitter_profiles.avg_rating / rating_count (may be absent in DB). */
const SERIAL_SELECT_BASE =
  "full_name, show_full_name, nanny_serial, nanny_id_number, years_experience, has_car, bio, hourly_rate_nis";

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
  const id = resolveSitterUserId(row);
  if (!id) return null;

  const fullName = typeof row.full_name === "string" ? row.full_name.trim() : "";
  const showFull = row.show_full_name === true;
  const displayFromName = showFull
    ? fullName
    : fullName.split(/\s+/)[0]?.trim() ?? "";

  const nannySerial = canonicalPublicSerial(row);

  return {
    id,
    full_name: fullName || null,
    display_name: displayFromName || null,
    nanny_serial: nannySerial || null,
    years_experience:
      typeof row.years_experience === "number" && Number.isFinite(row.years_experience)
        ? row.years_experience
        : null,
    has_car: row.has_car === true,
    bio: typeof row.bio === "string" ? row.bio : null,
    hourly_rate_nis:
      typeof row.hourly_rate_nis === "number" && Number.isFinite(row.hourly_rate_nis)
        ? row.hourly_rate_nis
        : null,
    avg_rating: null,
    rating_count: 0,
    avatar_url: null
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

function shouldFallbackBrowseFromRpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("is_available") ||
    lower.includes("list_public_sitters_no_is_available") ||
    lower.includes("could not find the function") ||
    lower.includes("function public.list_public_sitters_search") ||
    isPostgrestMissingColumnError(message, "rating_count") ||
    isPostgrestMissingColumnError(message, "avg_rating")
  );
}

/** Browse/filter search without RPC — used when `list_public_sitters_search` is missing or outdated. */
async function runBrowseParentSitterSearchDirect(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  const safe = normalizeParentSearchFilters(filters);
  const userColumn = getSitterProfilesUserColumn();
  const selectCols = `${userColumn}, ${SERIAL_SELECT_BASE}`;

  const minYears = minYearsExperienceToRpcValue(safe.minYearsExperience);
  let query = supabase.from(SITTER_PROFILES_TABLE).select(selectCols).eq("is_public", true);
  if (minYears > 0) {
    query = query.gte("years_experience", minYears);
  }

  const { data, error } = await query;
  if (error) {
    return { cards: [], error: error.message };
  }

  let rows = (data ?? []) as Record<string, unknown>[];

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

  return { cards, error: null };
}

async function fetchPublicSitterBySerialDirect(
  supabase: SupabaseClient,
  serial: string
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
    .filter((row) => rowMatchesSerial(row as Record<string, unknown>, serial))
    .map((row) => profileRowToSearchCard(row as Record<string, unknown>))
    .filter((c): c is PublicSitterSearchCard => c != null);

  return finalizeSerialSearchResults(cards, serial);
}

/**
 * Lookup by public nanny serial (AN-####) — direct profile read first (no rating columns),
 * then RPC when deployed.
 */
export async function fetchPublicSitterSearchBySerial(
  supabase: SupabaseClient,
  serialInput: string
): Promise<ParentSitterSearchResult> {
  const serial = normalizeSitterSerialForLookup(serialInput);
  if (!serial) {
    return { cards: [], error: null };
  }

  return fetchPublicSitterBySerialDirect(supabase, serial);
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
      return runBrowseParentSitterSearchDirect(supabase, filters);
    }
    return { cards: [], error: msg || "שגיאה בביצוע החיפוש" };
  }

  return { cards: parsePublicSearchCards(results), error: null };
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
