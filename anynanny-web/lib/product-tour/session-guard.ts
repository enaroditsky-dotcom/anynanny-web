import { PARENT_TOUR_KEY, SITTER_TOUR_KEY } from "@/lib/product-tour/constants";
import {
  applyParentTourPatch,
  applyProductTourPatch,
  mergeParentTourRows,
  mergeProductTourRows,
  type ParentTourTimestampPatch,
  type ProductTourTimestampPatch
} from "@/lib/product-tour/tour-row";
import type { ProductTourKey, UserProductTourRow } from "@/lib/product-tour/types";

export const PARENT_TOUR_SESSION_KEY_PREFIX = "anynanny_parent_tour_choice:" as const;
export const SITTER_TOUR_SESSION_KEY_PREFIX = "anynanny_sitter_tour_choice:" as const;

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

function asTourRow(value: unknown, userId: string, tourKey: ProductTourKey): UserProductTourRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    user_id: typeof row.user_id === "string" && row.user_id ? row.user_id : userId,
    tour_key: tourKey,
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
    return asTourRow(JSON.parse(raw) as unknown, userId, PARENT_TOUR_KEY);
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

export type SitterTourSessionStore = ParentTourSessionStore;

export function sitterTourSessionKey(userId: string): string {
  return `${SITTER_TOUR_SESSION_KEY_PREFIX}${userId}`;
}

export function readSitterTourSession(
  userId: string,
  store: SitterTourSessionStore | null = defaultSessionStore()
): UserProductTourRow | null {
  if (!userId || !store) return null;
  try {
    const raw = store.getItem(sitterTourSessionKey(userId));
    if (!raw) return null;
    return asTourRow(JSON.parse(raw) as unknown, userId, SITTER_TOUR_KEY);
  } catch {
    return null;
  }
}

export function writeSitterTourSession(
  row: UserProductTourRow,
  store: SitterTourSessionStore | null = defaultSessionStore()
): void {
  if (!row.user_id || !store) return;
  try {
    const merged =
      mergeProductTourRows(SITTER_TOUR_KEY, readSitterTourSession(row.user_id, store), row) ?? row;
    store.setItem(sitterTourSessionKey(row.user_id), JSON.stringify(merged));
  } catch {
    /* quota / private mode */
  }
}

export function rememberSitterTourChoice(
  userId: string,
  existing: UserProductTourRow | null | undefined,
  patch: ProductTourTimestampPatch,
  store: SitterTourSessionStore | null = defaultSessionStore()
): UserProductTourRow {
  const next = applyProductTourPatch(
    mergeProductTourRows(SITTER_TOUR_KEY, existing, readSitterTourSession(userId, store)),
    userId,
    SITTER_TOUR_KEY,
    patch
  );
  writeSitterTourSession(next, store);
  return next;
}
