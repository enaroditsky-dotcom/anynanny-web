import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUserRatingSummary } from "@/lib/ratings/fetch-user-rating-summary";
import {
  fetchPublicSitterProfileViaRpc,
  publicSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";

export type RejectedSitterSnapshot = {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
};

/**
 * Public sitter summary for a rejection notice snapshot.
 * Copied once at rejection time — not read back from live lists.
 */
export async function fetchRejectedSitterSnapshot(
  supabase: SupabaseClient,
  sitterId: string
): Promise<RejectedSitterSnapshot> {
  const id = sitterId.trim();
  if (!id) {
    return { id: "", name: "בייביסיטר", avatarUrl: null, rating: null };
  }

  const [publicProfile, ratingSummary] = await Promise.all([
    fetchPublicSitterProfileViaRpc(supabase, id),
    fetchUserRatingSummary(supabase, id)
  ]);

  const name = publicSitterDisplayName(publicProfile) || "בייביסיטר";
  const avatarRaw = publicProfile?.avatar_url?.trim() || "";
  const rating =
    ratingSummary.count > 0 && ratingSummary.average > 0
      ? ratingSummary.average
      : null;

  return {
    id,
    name,
    avatarUrl: avatarRaw.length > 0 ? avatarRaw : null,
    rating
  };
}
