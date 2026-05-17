export type CurrentUserRating = {
  avg_rating: number | null;
  rating_count: number;
  /** Sitter public serial from `sitter_profiles.nanny_serial` (RPC: nanny_id_number). */
  nanny_id_number: string | null;
};

export const EMPTY_CURRENT_USER_RATING: CurrentUserRating = {
  avg_rating: null,
  rating_count: 0,
  nanny_id_number: null
};

export function parseCurrentUserRating(data: unknown): CurrentUserRating {
  if (data == null) return EMPTY_CURRENT_USER_RATING;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return EMPTY_CURRENT_USER_RATING;

  const o = row as Record<string, unknown>;
  const avgRaw = o.avg_rating ?? o.avgRating;
  const countRaw = o.rating_count ?? o.ratingCount;
  const nannyRaw = o.nanny_id_number ?? o.nannyIdNumber ?? o.nanny_serial ?? o.nannySerial;

  const avg =
    avgRaw == null || avgRaw === ""
      ? null
      : Number.isFinite(Number(avgRaw))
        ? Number(avgRaw)
        : null;

  const rating_count = Number.isFinite(Number(countRaw)) ? Math.max(0, Math.floor(Number(countRaw))) : 0;

  const nannyTrimmed = typeof nannyRaw === "string" ? nannyRaw.trim() : "";
  const nanny_id_number = nannyTrimmed.length > 0 ? nannyTrimmed : null;

  return { avg_rating: avg, rating_count, nanny_id_number };
}

/** Badge copy: מספר נני: AN-1001 */
export function formatNannyIdBadgeText(nannyId: string | null | undefined): string | null {
  const id = (nannyId ?? "").trim();
  if (!id) return null;
  return `מספר נני: ${id}`;
}

/** Badge copy: ⭐ 4.8 (12 דירוגים) or ⭐ אין דירוג עדיין */
export function formatCurrentUserRatingBadgeText(rating: CurrentUserRating): string {
  const count = rating.rating_count ?? 0;
  if (count <= 0 || rating.avg_rating == null) {
    return "⭐ אין דירוג עדיין";
  }

  const avg = Number(rating.avg_rating).toFixed(1);
  const countPart = count === 1 ? "1 דירוג" : `${count} דירוגים`;
  return `⭐ ${avg} (${countPart})`;
}
