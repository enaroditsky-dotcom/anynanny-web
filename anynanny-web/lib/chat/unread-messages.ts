import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGES_TABLE } from "@/lib/chat/constants";
import {
  isPostgrestMissingColumnError,
  isSupabaseRpcUnavailableError,
  readSupabaseErrorMessage
} from "@/lib/supabase/postgrest-schema";

export const MARK_BOOKING_MESSAGES_READ_RPC = "mark_booking_messages_read";
export const CHAT_UNREAD_CHANGED_EVENT = "anynanny-chat-unread-changed";

export type IncomingChatMessageRow = {
  sender_id?: string;
  booking_id?: string;
};

/** `/parent/chat/[bookingId]` or `/sitter/chat/[bookingId]` — not the inbox. */
export function openConversationBookingId(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/(parent|sitter)\/chat\/([^/?#]+)/);
  const raw = match?.[2]?.trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function sameBookingId(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = String(left ?? "").trim().toLowerCase();
  const b = String(right ?? "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

export function notifyChatUnreadChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHAT_UNREAD_CHANGED_EVENT));
}

function logUnreadSchemaIssue(context: string, message: string): void {
  console.error(`[chat-unread] ${context}: ${message}`);
}

async function selectUnreadIncoming(
  supabase: SupabaseClient,
  userId: string,
  bookingId?: string
): Promise<{ unread: boolean; error: string | null }> {
  const uid = userId.trim();
  if (!uid) return { unread: false, error: null };

  let query = supabase
    .from(MESSAGES_TABLE)
    .select("id")
    .neq("sender_id", uid)
    .is("read_at", null)
    .limit(1);

  const trimmedBooking = bookingId?.trim();
  if (trimmedBooking) {
    query = query.eq("booking_id", trimmedBooking);
  }

  const { data, error } = await query;
  if (error) {
    const message = readSupabaseErrorMessage(error);
    if (isPostgrestMissingColumnError(message, "read_at")) {
      logUnreadSchemaIssue("messages.read_at is missing", message);
    } else {
      console.warn("[chat-unread] unread query:", message);
    }
    return { unread: false, error: message };
  }

  return { unread: Array.isArray(data) && data.length > 0, error: null };
}

/**
 * True when the current user has at least one incoming unread message.
 * Relies on messages RLS (participant bookings only). Does not write read_at.
 * Does not filter by booking status — cancelled conversations remain valid.
 */
export async function hasUnreadIncomingMessages(
  supabase: SupabaseClient,
  userId: string
): Promise<{ unread: boolean; error: string | null }> {
  return selectUnreadIncoming(supabase, userId);
}

export async function bookingHasUnreadIncoming(
  supabase: SupabaseClient,
  userId: string,
  bookingId: string
): Promise<{ unread: boolean; error: string | null }> {
  return selectUnreadIncoming(supabase, userId, bookingId);
}

/** Marks incoming messages in this booking as read via RPC only — never a client UPDATE. */
export async function markBookingMessagesRead(
  supabase: SupabaseClient,
  bookingId: string,
  userId?: string
): Promise<{ ok: boolean; error: string | null }> {
  const id = bookingId.trim();
  if (!id) return { ok: false, error: "missing booking id" };

  const { error } = await supabase.rpc(MARK_BOOKING_MESSAGES_READ_RPC, {
    p_booking_id: id
  });

  if (error) {
    const message = readSupabaseErrorMessage(error);
    if (isSupabaseRpcUnavailableError(error)) {
      logUnreadSchemaIssue("mark_booking_messages_read is unavailable", message);
    } else {
      console.warn("[chat-unread] mark_booking_messages_read:", message);
    }
    return { ok: false, error: message };
  }

  if (userId) {
    const verify = await bookingHasUnreadIncoming(supabase, userId, id);
    if (!verify.error && verify.unread) {
      logUnreadSchemaIssue(
        "mark_booking_messages_read returned success but incoming messages still have read_at IS NULL",
        id
      );
      return { ok: false, error: "read_at not updated" };
    }
    const { markNotificationsReadBestEffort } = await import("@/lib/notifications/read-state");
    await markNotificationsReadBestEffort(supabase, userId, {
      kind: "chat_message",
      bookingId: id
    });
    const { refreshAppBadgeBestEffort } = await import("@/lib/push/refresh-badge");
    await refreshAppBadgeBestEffort(userId);
  }

  return { ok: true, error: null };
}
