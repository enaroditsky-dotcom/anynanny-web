import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MESSAGES_TABLE } from "@/lib/chat/constants";
import type { IncomingChatMessageRow } from "@/lib/chat/unread-messages";
import { subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

/**
 * Chat realtime helpers — isolated from core shift logic.
 */
export const chatService = {
  /**
   * Listen for incoming messages visible to this user (RLS-scoped).
   * No server-side filter beyond INSERT — avoids CHANNEL_ERROR from unsupported filters.
   */
  subscribeToIncomingMessages(
    userId: string,
    onIncomingMessage: (row: IncomingChatMessageRow) => void
  ): RealtimeChannel | null {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId.trim()) return null;

    return subscribePostgresChanges(
      supabase,
      `user-chat-inbox-${userId}`,
      {
        event: "INSERT",
        table: MESSAGES_TABLE,
        handler: (payload) => {
          const row = payload.new as IncomingChatMessageRow | null;
          if (!row?.sender_id || row.sender_id === userId) return;
          onIncomingMessage(row);
        }
      },
      undefined,
      { maxRetries: 3 }
    );
  },

  /**
   * @deprecated Prefer {@link subscribeToIncomingMessages} for the nav badge.
   * Kept for booking-scoped chat rooms.
   */
  subscribeToNewMessages(
    bookingId: string,
    userId: string,
    onNewMessage: () => void
  ): RealtimeChannel | null {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !bookingId.trim() || !userId.trim()) return null;
    if (bookingId === "global-chat-channel") {
      return chatService.subscribeToIncomingMessages(userId, onNewMessage);
    }

    return subscribePostgresChanges(
      supabase,
      `booking-chat-${bookingId}`,
      {
        event: "INSERT",
        table: MESSAGES_TABLE,
        filter: `booking_id=eq.${bookingId}`,
        handler: (payload) => {
          const row = payload.new as { sender_id?: string } | null;
          if (row && row.sender_id !== userId) {
            onNewMessage();
          }
        }
      },
      undefined,
      { maxRetries: 3 }
    );
  }
};
