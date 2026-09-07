import type { SupabaseClient } from "@supabase/supabase-js";
import { PARENT_TOUR_KEY, SITTER_TOUR_KEY, USER_PRODUCT_TOURS_TABLE } from "@/lib/product-tour/constants";
import type { ProductTourKey, UserProductTourRow } from "@/lib/product-tour/types";
import { isPostgrestSchemaDriftError, readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

let productToursTableUnavailable = false;
let loggedProductToursTableUnavailable = false;

export function isParentProductToursTableUnavailable(): boolean {
  return productToursTableUnavailable;
}

export function isSitterProductToursTableUnavailable(): boolean {
  return productToursTableUnavailable;
}

function logProductTourPersistenceFailure(tourKey: ProductTourKey, action: string, error: unknown): void {
  const message = readSupabaseErrorMessage(error);
  if (isPostgrestSchemaDriftError(message)) {
    productToursTableUnavailable = true;
    if (loggedProductToursTableUnavailable) return;
    loggedProductToursTableUnavailable = true;
    console.warn(
      `[${tourKey}-tour] user_product_tours is unavailable; auto-invite uses an in-session guard only.`,
      message
    );
    return;
  }
  console.warn(`[${tourKey}-tour] user_product_tours`, action, "failed", message);
}

function asTourRow(value: unknown, tourKey: ProductTourKey): UserProductTourRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== "string" || row.user_id.length === 0) return null;
  return {
    user_id: row.user_id,
    tour_key: tourKey,
    offered_at: typeof row.offered_at === "string" ? row.offered_at : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    declined_at: typeof row.declined_at === "string" ? row.declined_at : null,
    skipped_at: typeof row.skipped_at === "string" ? row.skipped_at : null
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchProductTour(
  supabase: SupabaseClient,
  userId: string,
  tourKey: ProductTourKey
): Promise<UserProductTourRow | null> {
  if (productToursTableUnavailable) return null;
  const result = await supabase
    .from(USER_PRODUCT_TOURS_TABLE)
    .select("user_id, tour_key, offered_at, started_at, completed_at, declined_at, skipped_at")
    .eq("user_id", userId)
    .eq("tour_key", tourKey)
    .maybeSingle();

  if (result.error) {
    logProductTourPersistenceFailure(tourKey, "read", result.error);
    return null;
  }
  return asTourRow(result.data, tourKey);
}

async function upsertProductTour(
  supabase: SupabaseClient,
  userId: string,
  tourKey: ProductTourKey,
  patch: Partial<Omit<UserProductTourRow, "user_id" | "tour_key">>
): Promise<UserProductTourRow | null> {
  const existing = await fetchProductTour(supabase, userId, tourKey);
  if (productToursTableUnavailable) return existing;
  const payload = {
    user_id: userId,
    tour_key: tourKey,
    offered_at: patch.offered_at !== undefined ? patch.offered_at : existing?.offered_at ?? null,
    started_at: patch.started_at !== undefined ? patch.started_at : existing?.started_at ?? null,
    completed_at: patch.completed_at !== undefined ? patch.completed_at : existing?.completed_at ?? null,
    declined_at: patch.declined_at !== undefined ? patch.declined_at : existing?.declined_at ?? null,
    skipped_at: patch.skipped_at !== undefined ? patch.skipped_at : existing?.skipped_at ?? null,
    updated_at: nowIso()
  };

  const result = await supabase
    .from(USER_PRODUCT_TOURS_TABLE)
    .upsert(payload, { onConflict: "user_id,tour_key" })
    .select("user_id, tour_key, offered_at, started_at, completed_at, declined_at, skipped_at")
    .maybeSingle();

  if (result.error) {
    logProductTourPersistenceFailure(tourKey, "write", result.error);
    return existing;
  }
  return asTourRow(result.data, tourKey) ?? existing;
}

export async function fetchParentProductTour(supabase: SupabaseClient, userId: string) {
  return fetchProductTour(supabase, userId, PARENT_TOUR_KEY);
}

export async function upsertParentProductTour(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Omit<UserProductTourRow, "user_id" | "tour_key">>
) {
  return upsertProductTour(supabase, userId, PARENT_TOUR_KEY, patch);
}

export async function markParentTourOffered(supabase: SupabaseClient, userId: string) {
  const existing = await fetchParentProductTour(supabase, userId);
  if (existing?.offered_at) return existing;
  return upsertParentProductTour(supabase, userId, { offered_at: nowIso() });
}

export async function markParentTourStarted(supabase: SupabaseClient, userId: string) {
  const existing = await fetchParentProductTour(supabase, userId);
  return upsertParentProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    started_at: existing?.started_at ?? nowIso()
  });
}

export async function markParentTourDeclined(supabase: SupabaseClient, userId: string) {
  const existing = await fetchParentProductTour(supabase, userId);
  return upsertParentProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    declined_at: nowIso()
  });
}

export async function markParentTourSkipped(supabase: SupabaseClient, userId: string) {
  const existing = await fetchParentProductTour(supabase, userId);
  return upsertParentProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    skipped_at: nowIso()
  });
}

export async function markParentTourCompleted(supabase: SupabaseClient, userId: string) {
  const existing = await fetchParentProductTour(supabase, userId);
  return upsertParentProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    started_at: existing?.started_at ?? nowIso(),
    completed_at: nowIso()
  });
}

export async function fetchSitterProductTour(supabase: SupabaseClient, userId: string) {
  return fetchProductTour(supabase, userId, SITTER_TOUR_KEY);
}

export async function upsertSitterProductTour(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Omit<UserProductTourRow, "user_id" | "tour_key">>
) {
  return upsertProductTour(supabase, userId, SITTER_TOUR_KEY, patch);
}

export async function markSitterTourOffered(supabase: SupabaseClient, userId: string) {
  const existing = await fetchSitterProductTour(supabase, userId);
  if (existing?.offered_at) return existing;
  return upsertSitterProductTour(supabase, userId, { offered_at: nowIso() });
}

export async function markSitterTourStarted(supabase: SupabaseClient, userId: string) {
  const existing = await fetchSitterProductTour(supabase, userId);
  return upsertSitterProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    started_at: existing?.started_at ?? nowIso()
  });
}

export async function markSitterTourDeclined(supabase: SupabaseClient, userId: string) {
  const existing = await fetchSitterProductTour(supabase, userId);
  return upsertSitterProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    declined_at: nowIso()
  });
}

export async function markSitterTourSkipped(supabase: SupabaseClient, userId: string) {
  const existing = await fetchSitterProductTour(supabase, userId);
  return upsertSitterProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    skipped_at: nowIso()
  });
}

export async function markSitterTourCompleted(supabase: SupabaseClient, userId: string) {
  const existing = await fetchSitterProductTour(supabase, userId);
  return upsertSitterProductTour(supabase, userId, {
    offered_at: existing?.offered_at ?? nowIso(),
    started_at: existing?.started_at ?? nowIso(),
    completed_at: nowIso()
  });
}
