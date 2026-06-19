import { useEffect, useState } from "react";
import { chatService } from "../services/chatService";

/**
 * הוק חכם המאזין להודעות חדשות בריל-טיים ומנהל את סטייט הנקודה האדומה בשבילך
 */
export function useChatNotification(bookingId: string | undefined, userId: string | undefined) {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  useEffect(() => {
    if (!bookingId || !userId) return;

    // האזנה להודעות חדשות בתוך המשמרת הנוכחית
    const unsubscribe = chatService.subscribeToNewMessages(bookingId, userId, () => {
      console.log(`[Realtime Chat Update] New unread message detected for booking: ${bookingId}`);
      setHasUnreadMessages(true);
    });

    return () => {
      unsubscribe();
    };
  }, [bookingId, userId]);

  return {
    hasUnreadMessages,
    clearChatNotification: () => setHasUnreadMessages(false)
  };
}