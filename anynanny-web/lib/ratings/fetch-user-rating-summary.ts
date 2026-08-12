import type { SupabaseClient } from "@supabase/supabase-js";
import { RATINGS_TABLE } from "@/lib/ratings/constants";

export type UserRatingSummary = {
  average: number;
  count: number;
};

export type PublicUserReview = {
  rating: number;
  comment: string;
  created_at: string;
};

/** Average + count of published ratings received by a user. */
export async function fetchUserRatingSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRatingSummary> {
  const uid = userId.trim();

  if (!uid) {
    return {
      average: 0,
      count: 0
    };
  }

  let query = supabase
    .from(RATINGS_TABLE)
    .select("rating")
    .eq("to_user_id", uid)
    .not("published_at", "is", null);

  let { data, error } = await query;

  // Pre-migration fallback: column may not exist yet.
  if (error && /published_at|schema cache|column/i.test(error.message ?? "")) {
    const fallback = await supabase
      .from(RATINGS_TABLE)
      .select("rating")
      .eq("to_user_id", uid);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.warn(
      "[fetchUserRatingSummary] failed to load ratings:",
      error.message
    );

    return {
      average: 0,
      count: 0
    };
  }

  const ratings = (data ?? [])
    .map((row) => Number(row.rating))
    .filter(
      (rating) =>
        Number.isFinite(rating) &&
        rating >= 1 &&
        rating <= 5
    );

  if (ratings.length === 0) {
    return {
      average: 0,
      count: 0
    };
  }

  const sum = ratings.reduce(
    (total, rating) => total + rating,
    0
  );

  return {
    average: sum / ratings.length,
    count: ratings.length
  };
}

/** Published written reviews received by a user (anonymized — no author ids). */
export async function fetchUserPublicReviews(
  supabase: SupabaseClient,
  userId: string,
  limit = 5
): Promise<PublicUserReview[]> {
  const uid = userId.trim();
  if (!uid) return [];

  const capped = Math.max(1, Math.min(limit, 20));

  let { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("rating, comment, created_at")
    .eq("to_user_id", uid)
    .not("published_at", "is", null)
    .not("comment", "is", null)
    .order("created_at", { ascending: false })
    .limit(capped);

  if (error && /published_at|schema cache|column/i.test(error.message ?? "")) {
    const fallback = await supabase
      .from(RATINGS_TABLE)
      .select("rating, comment, created_at")
      .eq("to_user_id", uid)
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(capped);
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    if (error) {
      console.warn("[fetchUserPublicReviews]", error.message);
    }
    return [];
  }

  return (data as Array<Record<string, unknown>>)
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
