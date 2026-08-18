"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase/subscribe-postgres-changes";
import {
  CHAT_UNREAD_CHANGED_EVENT,
  hasUnreadIncomingMessages,
  markBookingMessagesRead,
  openConversationBookingId,
  sameBookingId
} from "@/lib/chat/unread-messages";
import { chatService } from "../services/chatService";

/**
 * Persistent unread badge for BottomNav.
 * Source of truth: public.messages.read_at.
 * Opening /messages does not mark read. Opening /chat/[bookingId] does.
 */
export function useChatNotification(userId: string | undefined) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      setHasUnreadMessages(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { unread, error } = await hasUnreadIncomingMessages(supabase, userId);
    if (error) return;
    setHasUnreadMessages(unread);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setHasUnreadMessages(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const viewingBookingId = openConversationBookingId(pathname);
    if (!viewingBookingId) {
      void refreshUnread();
      return;
    }

    let cancelled = false;
    void (async () => {
      await markBookingMessagesRead(supabase, viewingBookingId, userId);
      if (cancelled) return;
      await refreshUnread();
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, userId, refreshUnread]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onChanged = () => {
      void refreshUnread();
    };
    const onFocus = () => {
      void refreshUnread();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshUnread();
    };

    window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(CHAT_UNREAD_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshUnread]);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = chatService.subscribeToIncomingMessages(userId, (row) => {
      void (async () => {
        const viewing = openConversationBookingId(pathnameRef.current);
        const incomingBookingId = typeof row.booking_id === "string" ? row.booking_id.trim() : "";

        if (viewing && sameBookingId(viewing, incomingBookingId)) {
          if (supabase) {
            await markBookingMessagesRead(supabase, viewing, userId);
          }
          await refreshUnread();
          return;
        }

        if (viewing && !incomingBookingId) {
          if (supabase) {
            await markBookingMessagesRead(supabase, viewing, userId);
          }
          await refreshUnread();
          return;
        }

        const { unread, error } = supabase
          ? await hasUnreadIncomingMessages(supabase, userId)
          : { unread: true, error: null };
        if (error) {
          setHasUnreadMessages(true);
          return;
        }
        setHasUnreadMessages(unread);
      })();
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [userId, refreshUnread]);

  return {
    hasUnreadMessages
  };
}
