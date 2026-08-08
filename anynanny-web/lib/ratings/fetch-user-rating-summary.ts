import type { SupabaseClient } from "@supabase/supabase-js";
import { RATINGS_TABLE } from "@/lib/ratings/constants";

export type UserRatingSummary = {
  average: number;
  count: number;
};

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

  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("rating")
    .eq("to_user_id", uid);

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