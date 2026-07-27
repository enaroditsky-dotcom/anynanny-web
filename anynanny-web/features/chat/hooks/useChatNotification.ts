"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase/subscribe-postgres-changes";
import { chatService } from "../services/chatService";

const unreadStorageKey = (userId: string) => `anynanny_chat_unread_v1_${userId}`;

function readStoredUnread(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(unreadStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function writeStoredUnread(userId: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(unreadStorageKey(userId), "1");
    else window.sessionStorage.removeItem(unreadStorageKey(userId));
  } catch {
    /* ignore */
  }
}

function isMessagesRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/parent/messages") ||
    pathname.startsWith("/sitter/messages") ||
    pathname.startsWith("/parent/chat/") ||
    pathname.startsWith("/sitter/chat/")
  );
}

/**
 * Realtime unread badge for BottomNav.
 * Pass the authenticated user id only — do not pass a fake booking id.
 */
export function useChatNotification(userId: string | undefined) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasUnreadMessages(false);
      return;
    }
    setHasUnreadMessages(readStoredUnread(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!isMessagesRoute(pathname)) return;
    writeStoredUnread(userId, false);
    setHasUnreadMessages(false);
  }, [pathname, userId]);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = chatService.subscribeToIncomingMessages(userId, () => {
      if (isMessagesRoute(pathnameRef.current)) return;
      writeStoredUnread(userId, true);
      setHasUnreadMessages(true);
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [userId]);

  return {
    hasUnreadMessages,
    clearChatNotification: () => {
      if (userId) writeStoredUnread(userId, false);
      setHasUnreadMessages(false);
    }
  };
}
