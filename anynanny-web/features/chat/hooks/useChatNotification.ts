import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase/subscribe-postgres-changes";
import { chatService } from "../services/chatService";

/**
 * Realtime chat badge. Subscribes once per bookingId+userId; BottomNav stays mounted
 * in AppShellGate so route transitions do not tear down / recreate the channel.
 */
export function useChatNotification(bookingId: string | undefined, userId: string | undefined) {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  useEffect(() => {
    if (!bookingId || !userId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = chatService.subscribeToNewMessages(bookingId, userId, () => {
      setHasUnreadMessages(true);
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [bookingId, userId]);

  return {
    hasUnreadMessages,
    clearChatNotification: () => setHasUnreadMessages(false)
  };
}
