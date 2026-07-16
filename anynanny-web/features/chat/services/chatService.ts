import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

/**
 * שירות צ'אט והתראות הודעות - מבודד לחלוטין מקוד הליבה
 */
export const chatService = {
  /**
   * מנגנון האזנה בריל-טיים להודעות חדשות במשמרת ספציפית
   */
  subscribeToNewMessages(
    bookingId: string,
    userId: string,
    onNewMessage: () => void
  ): RealtimeChannel | null {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !bookingId.trim() || !userId.trim()) return null;

    return subscribePostgresChanges(supabase, `booking-chat-${bookingId}`, {
      event: "INSERT",
      table: "messages",
      filter: `booking_id=eq.${bookingId}`,
      handler: (payload) => {
        const row = payload.new as { sender_id?: string } | null;
        if (row && row.sender_id !== userId) {
          onNewMessage();
        }
      }
    });
  }
};
