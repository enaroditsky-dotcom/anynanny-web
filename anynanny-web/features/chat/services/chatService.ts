import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
  ) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return () => {};

    const channel = supabase
      .channel(`booking-chat-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          // מדליקים התראה רק אם ההודעה החדשה הגיעה מהצד השני (לא מאיתנו)
          if (payload.new && payload.new.sender_id !== userId) {
            onNewMessage();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }
};