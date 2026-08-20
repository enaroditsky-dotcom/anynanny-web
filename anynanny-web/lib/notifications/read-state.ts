import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import type { CanonicalNotificationKind } from "@/lib/notifications/kinds";
import {
  isPostgrestMissingColumnError,
  readSupabaseErrorMessage
} from "@/lib/supabase/postgrest-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MarkNotificationsReadInput = {
  ids?: string[];
  kind?: CanonicalNotificationKind | CanonicalNotificationKind[];
  bookingId?: string;
};

function isDuplicateNotificationError(message: string, code?: string): boolean {
  if (code === "23505") return true;
  return /duplicate|unique/i.test(message);
}

/**
 * Unread count for the signed-in user. Relies on notifications RLS.
 * Does not mark rows read.
 */
export async function countUnreadNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<{ count: number; error: string | null }> {
  const uid = userId.trim();
  if (!uid) return { count: 0, error: null };

  const { count, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .is("read_at", null);

  if (error) {
    return { count: 0, error: readSupabaseErrorMessage(error) };
  }

  return { count: count ?? 0, error: null };
}

/**
 * Mark the caller's own notifications read. RLS + column grant limit this to
 * `read_at` on rows where user_id = auth.uid().
 * Does not run on dashboard load — callers should use a meaningful act/open event.
 */
export async function markNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  input: MarkNotificationsReadInput = {}
): Promise<{ updated: number; error: string | null }> {
  const uid = userId.trim();
  if (!uid) return { updated: 0, error: null };

  const ids = (input.ids ?? []).map((id) => id.trim()).filter(Boolean);
  const kinds = (Array.isArray(input.kind) ? input.kind : input.kind ? [input.kind] : [])
    .map((kind) => kind.trim())
    .filter(Boolean);
  const bookingId = input.bookingId?.trim() ?? "";

  if (ids.length === 0 && kinds.length === 0 && !bookingId) {
    return { updated: 0, error: null };
  }

  let query = supabase
    .from(NOTIFICATIONS_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", uid)
    .is("read_at", null);

  if (ids.length > 0) query = query.in("id", ids);
  if (kinds.length === 1) query = query.eq("kind", kinds[0]);
  else if (kinds.length > 1) query = query.in("kind", kinds);
  if (bookingId) query = query.filter("payload->>booking_id", "eq", bookingId);

  const { data, error } = await query.select("id");
  if (error) {
    return { updated: 0, error: readSupabaseErrorMessage(error) };
  }

  return { updated: Array.isArray(data) ? data.length : 0, error: null };
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  userId: string,
  notificationId: string
): Promise<{ ok: boolean; error: string | null }> {
  const id = notificationId.trim();
  if (!id) return { ok: false, error: "missing notification id" };
  const result = await markNotificationsRead(supabase, userId, { ids: [id] });
  return { ok: !result.error, error: result.error };
}

/** Best-effort: never throw, never fail the calling product flow. */
export async function markNotificationsReadBestEffort(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  input: MarkNotificationsReadInput
): Promise<void> {
  const uid = String(userId ?? "").trim();
  if (!uid) return;
  try {
    const result = await markNotificationsRead(supabase, uid, input);
    if (!result.error) {
      const { refreshAppBadgeBestEffort } = await import("@/lib/push/refresh-badge");
      await refreshAppBadgeBestEffort(uid);
      return;
    }
    if (isPostgrestMissingColumnError(result.error, "read_at")) return;
    if (isDuplicateNotificationError(result.error)) return;
    console.warn("[notifications] mark read:", result.error);
  } catch (err) {
    console.warn("[notifications] mark read:", err);
  }
}

export { isDuplicateNotificationError };
