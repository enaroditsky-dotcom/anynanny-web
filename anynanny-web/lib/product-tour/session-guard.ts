import { PARENT_TOUR_KEY } from "@/lib/product-tour/constants";
import {
  applyParentTourPatch,
  mergeParentTourRows,
  type ParentTourTimestampPatch
} from "@/lib/product-tour/tour-row";
import type { UserProductTourRow } from "@/lib/product-tour/types";

export const PARENT_TOUR_SESSION_KEY_PREFIX = "anynanny_parent_tour_choice:" as const;

export type ParentTourSessionStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function parentTourSessionKey(userId: string): string {
  return `${PARENT_TOUR_SESSION_KEY_PREFIX}${userId}`;
}

function defaultSessionStore(): ParentTourSessionStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function asTourRow(value: unknown, userId: string): UserProductTourRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    user_id: typeof row.user_id === "string" && row.user_id ? row.user_id : userId,
    tour_key: PARENT_TOUR_KEY,
    offered_at: typeof row.offered_at === "string" ? row.offered_at : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    declined_at: typeof row.declined_at === "string" ? row.declined_at : null,
    skipped_at: typeof row.skipped_at === "string" ? row.skipped_at : null
  };
}

export function readParentTourSession(
  userId: string,
  store: ParentTourSessionStore | null = defaultSessionStore()
): UserProductTourRow | null {
  if (!userId || !store) return null;
  try {
    const raw = store.getItem(parentTourSessionKey(userId));
    if (!raw) return null;
    return asTourRow(JSON.parse(raw) as unknown, userId);
  } catch {
    return null;
  }
}

export function writeParentTourSession(
  row: UserProductTourRow,
  store: ParentTourSessionStore | null = defaultSessionStore()
): void {
  if (!row.user_id || !store) return;
  try {
    const merged = mergeParentTourRows(readParentTourSession(row.user_id, store), row) ?? row;
    store.setItem(parentTourSessionKey(row.user_id), JSON.stringify(merged));
  } catch {
    /* quota / private mode */
  }
}

/** Immediate in-session record so auto-invite cannot loop before/without a DB write. */
export function rememberParentTourChoice(
  userId: string,
  existing: UserProductTourRow | null | undefined,
  patch: ParentTourTimestampPatch,
  store: ParentTourSessionStore | null = defaultSessionStore()
): UserProductTourRow {
  const next = applyParentTourPatch(
    mergeParentTourRows(existing, readParentTourSession(userId, store)),
    userId,
    patch
  );
  writeParentTourSession(next, store);
  return next;
}
