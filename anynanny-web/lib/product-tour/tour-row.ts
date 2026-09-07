import { PARENT_TOUR_KEY } from "@/lib/product-tour/constants";
import type { ProductTourKey, UserProductTourRow } from "@/lib/product-tour/types";

export type ParentTourTimestampPatch = Partial<Omit<UserProductTourRow, "user_id" | "tour_key">>;
export type ProductTourTimestampPatch = ParentTourTimestampPatch;

export function emptyProductTourRow(userId: string, tourKey: ProductTourKey): UserProductTourRow {
  return {
    user_id: userId,
    tour_key: tourKey,
    offered_at: null,
    started_at: null,
    completed_at: null,
    declined_at: null,
    skipped_at: null
  };
}

export function emptyParentTourRow(userId: string): UserProductTourRow {
  return emptyProductTourRow(userId, PARENT_TOUR_KEY);
}

export function mergeProductTourRows(
  tourKey: ProductTourKey,
  ...rows: Array<UserProductTourRow | null | undefined>
): UserProductTourRow | null {
  const present = rows.filter((row): row is UserProductTourRow => Boolean(row));
  if (present.length === 0) return null;
  const merged = emptyProductTourRow(present[0]?.user_id ?? "", tourKey);
  for (const row of present) {
    if (row.user_id) merged.user_id = row.user_id;
    merged.offered_at = merged.offered_at ?? row.offered_at;
    merged.started_at = merged.started_at ?? row.started_at;
    merged.completed_at = merged.completed_at ?? row.completed_at;
    merged.declined_at = merged.declined_at ?? row.declined_at;
    merged.skipped_at = merged.skipped_at ?? row.skipped_at;
  }
  return merged;
}

export function mergeParentTourRows(
  ...rows: Array<UserProductTourRow | null | undefined>
): UserProductTourRow | null {
  return mergeProductTourRows(PARENT_TOUR_KEY, ...rows);
}

export function applyProductTourPatch(
  existing: UserProductTourRow | null | undefined,
  userId: string,
  tourKey: ProductTourKey,
  patch: ProductTourTimestampPatch
): UserProductTourRow {
  const base = existing
    ? { ...existing, user_id: userId, tour_key: tourKey }
    : emptyProductTourRow(userId, tourKey);
  const overlay = emptyProductTourRow(userId, tourKey);
  if (patch.offered_at !== undefined) overlay.offered_at = patch.offered_at;
  if (patch.started_at !== undefined) overlay.started_at = patch.started_at;
  if (patch.completed_at !== undefined) overlay.completed_at = patch.completed_at;
  if (patch.declined_at !== undefined) overlay.declined_at = patch.declined_at;
  if (patch.skipped_at !== undefined) overlay.skipped_at = patch.skipped_at;
  return mergeProductTourRows(tourKey, base, overlay) ?? overlay;
}

export function applyParentTourPatch(
  existing: UserProductTourRow | null | undefined,
  userId: string,
  patch: ParentTourTimestampPatch
): UserProductTourRow {
  return applyProductTourPatch(existing, userId, PARENT_TOUR_KEY, patch);
}
