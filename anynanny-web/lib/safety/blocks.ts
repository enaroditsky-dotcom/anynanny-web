import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { isSafetyUuid, USER_BLOCKS_TABLE } from "@/lib/safety/constants";

export type BlockedUserRow = {
  blockedId: string;
  createdAt: string;
};

export async function fetchOwnBlockList(
  supabase: SupabaseClient,
  blockerId: string
): Promise<{ rows: BlockedUserRow[]; error: string | null }> {
  if (!isSafetyUuid(blockerId)) return { rows: [], error: null };

  const { data, error } = await supabase
    .from(USER_BLOCKS_TABLE)
    .select("blocked_id, created_at")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isPostgrestSchemaDriftError(error.message)) return { rows: [], error: null };
    return { rows: [], error: error.message };
  }

  return {
    rows: (data ?? []).map((row) => ({
      blockedId: String((row as { blocked_id: string }).blocked_id),
      createdAt: String((row as { created_at?: string }).created_at ?? "")
    })),
    error: null
  };
}

export async function fetchHasBlockedUser(
  supabase: SupabaseClient,
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  if (!isSafetyUuid(blockerId) || !isSafetyUuid(blockedId) || blockerId === blockedId) return false;

  const { data, error } = await supabase
    .from(USER_BLOCKS_TABLE)
    .select("blocker_id")
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function blockUser(
  supabase: SupabaseClient,
  blockerId: string,
  blockedId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSafetyUuid(blockerId) || !isSafetyUuid(blockedId)) {
    return { ok: false, message: "לא ניתן לחסום משתמש זה." };
  }
  if (blockerId === blockedId) {
    return { ok: false, message: "לא ניתן לחסום את עצמך." };
  }

  const { error } = await supabase.from(USER_BLOCKS_TABLE).insert({
    blocker_id: blockerId,
    blocked_id: blockedId
  });

  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "23505") return { ok: true };
    if (isPostgrestSchemaDriftError(error.message)) {
      return { ok: false, message: "חסימה עדיין לא זמינה. נסו שוב מאוחר יותר." };
    }
    return { ok: false, message: error.message || "החסימה נכשלה." };
  }

  return { ok: true };
}

export async function unblockUser(
  supabase: SupabaseClient,
  blockerId: string,
  blockedId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSafetyUuid(blockerId) || !isSafetyUuid(blockedId)) {
    return { ok: false, message: "לא ניתן לבטל חסימה." };
  }

  const { error } = await supabase
    .from(USER_BLOCKS_TABLE)
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);

  if (error) {
    if (isPostgrestSchemaDriftError(error.message)) {
      return { ok: false, message: "ביטול חסימה עדיין לא זמין." };
    }
    return { ok: false, message: error.message || "ביטול החסימה נכשל." };
  }

  return { ok: true };
}
