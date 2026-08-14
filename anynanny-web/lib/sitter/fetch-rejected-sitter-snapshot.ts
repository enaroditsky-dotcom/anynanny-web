import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUserRatingSummary } from "@/lib/ratings/fetch-user-rating-summary";

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

  const [{ data: nameRow }, ratingSummary] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url")
      .eq("id", id)
      .maybeSingle(),
    fetchUserRatingSummary(supabase, id)
  ]);

  const name =
    `${String((nameRow as { first_name?: string } | null)?.first_name ?? "")} ${String(
      (nameRow as { last_name?: string } | null)?.last_name ?? ""
    )}`.trim() || "בייביסיטר";

  const avatarRaw =
    nameRow && typeof (nameRow as { avatar_url?: unknown }).avatar_url === "string"
      ? String((nameRow as { avatar_url: string }).avatar_url).trim()
      : "";

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
