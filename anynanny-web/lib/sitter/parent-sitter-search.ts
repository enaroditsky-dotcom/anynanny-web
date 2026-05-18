import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isExactSitterSerialQuery,
  normalizeSitterSerialForLookup,
  toListPublicSittersSearchRpcArgs,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import { parsePublicSearchCards } from "@/lib/sitter/public-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import { SITTER_PROFILES_TABLE } from "@/lib/sitter/sitter-profile";

export type ParentSitterSearchResult = {
  cards: PublicSitterSearchCard[];
  error: string | null;
};

function profileRowToSearchCard(row: Record<string, unknown>): PublicSitterSearchCard | null {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;

  const fullName = typeof row.full_name === "string" ? row.full_name.trim() : "";
  const showFull = row.show_full_name === true;
  const displayFromName = showFull
    ? fullName
    : fullName.split(/\s+/)[0]?.trim() ?? "";

  return {
    id,
    full_name: fullName || null,
    display_name: displayFromName || null,
    nanny_serial:
      (typeof row.nanny_serial === "string" && row.nanny_serial.trim()) ||
      (typeof row.nanny_id_number === "string" && row.nanny_id_number.trim()) ||
      null,
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
    avg_rating:
      typeof row.avg_rating === "number" && Number.isFinite(row.avg_rating) ? row.avg_rating : null,
    rating_count:
      typeof row.rating_count === "number" && Number.isFinite(row.rating_count) ? row.rating_count : 0,
    avatar_url: null
  };
}

/** Direct lookup by public serial — no RPC, no availability boolean, no session window. */
export async function fetchPublicSitterSearchBySerial(
  supabase: SupabaseClient,
  serialInput: string
): Promise<ParentSitterSearchResult> {
  const serial = normalizeSitterSerialForLookup(serialInput);
  if (!serial) {
    return { cards: [], error: null };
  }

  const quoted = `"${serial.replace(/"/g, "")}"`;
  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(
      "id, full_name, show_full_name, nanny_serial, nanny_id_number, years_experience, has_car, bio, hourly_rate_nis, avg_rating, rating_count"
    )
    .eq("is_public", true)
    .or(`nanny_serial.eq.${quoted},nanny_id_number.eq.${quoted}`);

  if (error) {
    return { cards: [], error: error.message };
  }

  const cards = (data ?? [])
    .map((row) => profileRowToSearchCard(row as Record<string, unknown>))
    .filter((c): c is PublicSitterSearchCard => c != null);

  return { cards, error: null };
}

export async function runListPublicSittersSearchRpc(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  const args = toListPublicSittersSearchRpcArgs(filters);

  const { data: results, error } = await supabase.rpc("list_public_sitters_search", args);

  if (error) {
    const msg = error.message ?? "";
    if (msg.toLowerCase().includes("is_available")) {
      return {
        cards: [],
        error:
          "חיפוש זמין לא מעודכן בשרת — הריצו את המיגרציה 20260516250000_list_public_sitters_no_is_available ב-Supabase."
      };
    }
    return { cards: [], error: msg || "שגיאה בביצוע החיפוש" };
  }

  return { cards: parsePublicSearchCards(results), error: null };
}

/** Serial code → direct profile fetch; otherwise filtered RPC (no is_available). */
export async function runParentSitterSearch(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  const serial = filters.searchSitterSerial.trim();
  if (serial && isExactSitterSerialQuery(serial)) {
    return fetchPublicSitterSearchBySerial(supabase, serial);
  }

  return runListPublicSittersSearchRpc(supabase, filters);
}
