import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  normalizeParentSearchFilters,
  toListPublicSittersSearchRpcArgs,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import { parsePublicSearchCards } from "@/lib/sitter/public-search-card";

export type ParentSitterSearchResult = {
  sitters: PublicSitterSearchCard[];
  error: string | null;
};

/**
 * Parent search — RPC only (`list_public_sitters_search`).
 * Reads `public.sitter_profiles` inside the database function; no `.from('nanny')` calls.
 */
export async function runParentSitterSearch(
  supabase: SupabaseClient,
  filters: ParentSearchFilters
): Promise<ParentSitterSearchResult> {
  const rpcParams = toListPublicSittersSearchRpcArgs(normalizeParentSearchFilters(filters));

  const { data, error } = await supabase.rpc("list_public_sitters_search", {
    p_search_nanny_id: rpcParams.p_search_nanny_id,
    p_start_time: rpcParams.p_start_time,
    p_end_time: rpcParams.p_end_time,
    p_min_years_experience: rpcParams.p_min_years_experience,
    p_min_rating: rpcParams.p_min_rating,
    p_transport: rpcParams.p_transport,
    p_max_hourly_rate: rpcParams.p_max_hourly_rate
  });

  if (error) {
    return { sitters: [], error: error.message };
  }

  return { sitters: parsePublicSearchCards(data), error: null };
}
