import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PARENT_FAVORITE_SITTERS_TABLE,
  classifyFavoriteInsert,
  shouldOfferFavoritePrompt,
  type FavoriteInsertClassification
} from "@/lib/favorites/parent-favorite-rules";
import {
  fetchPublicSitterProfileViaRpc,
  fetchPublicSitterProfilesViaRpc,
  publicSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";
import { pickProfilePublicId } from "@/lib/public/sequential-display-id";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export type FavoriteSitterSummary = {
  sitterId: string;
  firstName: string;
  lastName: string;
  anyNannyId: string | null;
};

export type FavoritePromptTarget = {
  sitterId: string;
  sitterName: string;
};

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ? String(user.id) : null;
}

export async function listParentFavoriteSitterIds(
  supabase: SupabaseClient
): Promise<{ ids: string[]; error: string | null }> {
  const parentId = await currentUserId(supabase);
  if (!parentId) return { ids: [], error: "יש להתחבר כדי לראות מועדפות." };

  const { data, error } = await supabase
    .from(PARENT_FAVORITE_SITTERS_TABLE)
    .select("sitter_id, created_at")
    .eq("parent_id", parentId)
    .order("created_at", { ascending: false });

  if (error) return { ids: [], error: readSupabaseErrorMessage(error) };
  const ids = (data ?? [])
    .map((row) => String((row as { sitter_id?: string }).sitter_id ?? "").trim())
    .filter(Boolean);
  return { ids, error: null };
}

export async function isParentFavoriteSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<boolean> {
  const id = sitterId.trim();
  if (!id) return false;
  const parentId = await currentUserId(supabase);
  if (!parentId) return false;

  const { data, error } = await supabase
    .from(PARENT_FAVORITE_SITTERS_TABLE)
    .select("sitter_id")
    .eq("parent_id", parentId)
    .eq("sitter_id", id)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function addParentFavoriteSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<FavoriteInsertClassification> {
  const id = sitterId.trim();
  const parentId = await currentUserId(supabase);
  if (!parentId || !id) {
    return {
      created: false,
      alreadyFavorite: false,
      notify: false,
      error: "יש להתחבר כדי להוסיף למועדפות."
    };
  }

  const { error } = await supabase.from(PARENT_FAVORITE_SITTERS_TABLE).insert({
    parent_id: parentId,
    sitter_id: id
  });

  if (!error) return classifyFavoriteInsert({});
  return classifyFavoriteInsert({
    errorCode: errorCode(error),
    errorMessage: readSupabaseErrorMessage(error)
  });
}

export async function removeParentFavoriteSitter(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ ok: boolean; error: string | null }> {
  const id = sitterId.trim();
  const parentId = await currentUserId(supabase);
  if (!parentId || !id) return { ok: false, error: "יש להתחבר כדי להסיר ממועדפות." };

  const { error } = await supabase
    .from(PARENT_FAVORITE_SITTERS_TABLE)
    .delete()
    .eq("parent_id", parentId)
    .eq("sitter_id", id);

  if (error) return { ok: false, error: readSupabaseErrorMessage(error) };
  return { ok: true, error: null };
}

export async function listParentFavoriteSitters(
  supabase: SupabaseClient
): Promise<{ sitters: FavoriteSitterSummary[]; error: string | null }> {
  const listed = await listParentFavoriteSitterIds(supabase);
  if (listed.error) return { sitters: [], error: listed.error };
  if (listed.ids.length === 0) return { sitters: [], error: null };

  const profiles = await fetchPublicSitterProfilesViaRpc(supabase, listed.ids);
  const sitters = listed.ids.map((sitterId) => {
    const profile = profiles.get(sitterId);
    return {
      sitterId,
      firstName: String(profile?.first_name ?? "").trim(),
      lastName: String(profile?.last_name ?? "").trim(),
      anyNannyId: pickProfilePublicId({ nanny_serial: profile?.nanny_serial ?? null }, "sitter")
    };
  });
  return { sitters, error: null };
}

/**
 * After payment and rating succeed, offer the prompt only when the sitter
 * is not already a favorite. Failure returns null and must not block settlement.
 */
export async function resolvePostSettlementFavoritePrompt(
  supabase: SupabaseClient,
  sitterId: string
): Promise<FavoritePromptTarget | null> {
  const id = sitterId.trim();
  if (!id) return null;
  const alreadyFavorite = await isParentFavoriteSitter(supabase, id);
  if (!shouldOfferFavoritePrompt(alreadyFavorite)) return null;

  const profile = await fetchPublicSitterProfileViaRpc(supabase, id);
  return {
    sitterId: id,
    sitterName: publicSitterDisplayName(profile) || "הבייביסיטרית"
  };
}
