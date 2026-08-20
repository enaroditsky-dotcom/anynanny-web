import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGES_TABLE, NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import { computeAppBadgeCount } from "@/lib/push/badge";
import { isPostgrestMissingColumnError, readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export async function countUnreadNonChatNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;
  const { count, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .is("read_at", null)
    .neq("kind", "chat_message");
  if (error) {
    const message = readSupabaseErrorMessage(error);
    if (!isPostgrestMissingColumnError(message, "read_at")) {
      console.warn("[push-badge] unread notifications:", message);
    }
    return 0;
  }
  return count ?? 0;
}

export async function countDistinctUnreadIncomingChatBookings(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select("booking_id")
    .neq("sender_id", uid)
    .is("read_at", null);
  if (error) {
    const message = readSupabaseErrorMessage(error);
    if (!isPostgrestMissingColumnError(message, "read_at")) {
      console.warn("[push-badge] unread chats:", message);
    }
    return 0;
  }
  const ids = new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => String((row as { booking_id?: string }).booking_id ?? "").trim())
      .filter(Boolean)
  );
  return ids.size;
}

export async function loadAppBadgeCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const [unreadNonChatNotifications, distinctUnreadIncomingChatBookings] = await Promise.all([
    countUnreadNonChatNotifications(supabase, userId),
    countDistinctUnreadIncomingChatBookings(supabase, userId)
  ]);
  return computeAppBadgeCount({
    unreadNonChatNotifications,
    distinctUnreadIncomingChatBookings
  });
}
