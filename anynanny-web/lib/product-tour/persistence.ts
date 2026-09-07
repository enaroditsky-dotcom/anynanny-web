import type { SupabaseClient } from "@supabase/supabase-js";
import { PARENT_TOUR_KEY, USER_PRODUCT_TOURS_TABLE } from "@/lib/product-tour/constants";
import type { UserProductTourRow } from "@/lib/product-tour/types";
import { isPostgrestSchemaDriftError, readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

let parentTourTableUnavailable = false;
let loggedParentTourTableUnavailable = false;

export function isParentProductToursTableUnavailable(): boolean {
  return parentTourTableUnavailable;
}

function logParentTourPersistenceFailure(action: string, error: unknown): void {
  const message = readSupabaseErrorMessage(error);
  if (isPostgrestSchemaDriftError(message)) {
    parentTourTableUnavailable = true;
    if (loggedParentTourTableUnavailable) return;
    loggedParentTourTableUnavailable = true;
    console.warn(
      "[parent-tour] user_product_tours is unavailable; auto-invite uses an in-session guard only.",
      message
    );
    return;
  }
  console.warn("[parent-tour] user_product_tours", action, "failed", message);
}

function asTourRow(value: unknown): UserProductTourRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== "string" || row.user_id.length === 0) return null;
  return {
    user_id: row.user_id,
    tour_key: PARENT_TOUR_KEY,
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

export async function fetchParentProductTour(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProductTourRow | null> {
  if (parentTourTableUnavailable) return null;
  const result = await supabase
    .from(USER_PRODUCT_TOURS_TABLE)
    .select("user_id, tour_key, offered_at, started_at, completed_at, declined_at, skipped_at")
    .eq("user_id", userId)
    .eq("tour_key", PARENT_TOUR_KEY)
    .maybeSingle();

  if (result.error) {
    logParentTourPersistenceFailure("read", result.error);
    return null;
  }
  return asTourRow(result.data);
}

export async function upsertParentProductTour(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Omit<UserProductTourRow, "user_id" | "tour_key">>
): Promise<UserProductTourRow | null> {
  const existing = await fetchParentProductTour(supabase, userId);
  if (parentTourTableUnavailable) return existing;
  const payload = {
    user_id: userId,
    tour_key: PARENT_TOUR_KEY,
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
    logParentTourPersistenceFailure("write", result.error);
    return existing;
  }
  return asTourRow(result.data) ?? existing;
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
