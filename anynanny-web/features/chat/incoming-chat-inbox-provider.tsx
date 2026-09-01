"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GlobalChatToast } from "@/components/notifications/global-chat-toast";
import { verifyBookingChatParticipant } from "@/lib/chat/booking-messages";
import {
  CHAT_OPEN_CONVERSATION_EVENT,
  getMountedChatConversation
} from "@/lib/chat/composer-chrome";
import {
  chatConversationHref,
  incomingChatToastMessageId,
  nextIncomingChatToast,
  shouldShowIncomingChatToast,
  withIncomingChatToastSenderName,
  type IncomingChatToastState
} from "@/lib/chat/incoming-chat-toast";
import { firstNameFromPartnerDisplay, previewChatMessageContent } from "@/lib/chat/message-preview";
import {
  CHAT_UNREAD_CHANGED_EVENT,
  hasUnreadIncomingMessages,
  isViewingConversation,
  markBookingMessagesRead,
  openConversationBookingId,
  type IncomingChatMessageRow
} from "@/lib/chat/unread-messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase/subscribe-postgres-changes";
import { chatService } from "@/features/chat/services/chatService";

type IncomingChatInboxValue = {
  hasUnreadMessages: boolean;
};

const IncomingChatInboxContext = createContext<IncomingChatInboxValue | null>(null);

export function useIncomingChatInbox(): IncomingChatInboxValue {
  const ctx = useContext(IncomingChatInboxContext);
  if (!ctx) {
    throw new Error("useIncomingChatInbox must be used within IncomingChatInboxProvider");
  }
  return ctx;
}

export function useChatNotification(_userId?: string): { hasUnreadMessages: boolean } {
  const ctx = useContext(IncomingChatInboxContext);
  return { hasUnreadMessages: ctx?.hasUnreadMessages ?? false };
}

export function IncomingChatInboxProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { signedIn, user, currentRole, effectiveRole } = useAuth();
  const userId = signedIn && user?.id ? user.id : undefined;
  const role: "parent" | "sitter" =
    effectiveRole === "sitter" || effectiveRole === "parent" ? effectiveRole : currentRole === "sitter" ? "sitter" : "parent";

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const senderNameCacheRef = useRef(new Map<string, string>());
  const seenToastIdsRef = useRef(new Set<string>());

  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [toast, setToast] = useState<IncomingChatToastState | null>(null);

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

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    senderNameCacheRef.current = new Map();
    seenToastIdsRef.current = new Set();
    setToast(null);
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
    const hideIfViewing = () => {
      setToast((current) => {
        if (!current) return current;
        if (isViewingConversation(pathnameRef.current, current.bookingId, getMountedChatConversation())) {
          return null;
        }
        return current;
      });
    };
    hideIfViewing();
    if (typeof window === "undefined") return;
    window.addEventListener(CHAT_OPEN_CONVERSATION_EVENT, hideIfViewing);
    return () => window.removeEventListener(CHAT_OPEN_CONVERSATION_EVENT, hideIfViewing);
  }, [pathname]);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = chatService.subscribeToIncomingMessages(userId, (row: IncomingChatMessageRow) => {
      const incomingBookingId = typeof row.booking_id === "string" ? row.booking_id.trim() : "";
      const viewingRoute = openConversationBookingId(pathnameRef.current);
      const viewingMounted = getMountedChatConversation();
      const sameOpen = isViewingConversation(pathnameRef.current, incomingBookingId, viewingMounted);

      if (!sameOpen && incomingBookingId) {
        const messageId = incomingChatToastMessageId(row);
        if (
          messageId &&
          shouldShowIncomingChatToast({
            pathname: pathnameRef.current,
            mountedBookingId: viewingMounted,
            incomingBookingId
          })
        ) {
          const senderId = typeof row.sender_id === "string" ? row.sender_id.trim() : "";
          const cachedName = senderId ? senderNameCacheRef.current.get(senderId) ?? null : null;
          const next = nextIncomingChatToast({
            current: null,
            seenIds: seenToastIdsRef.current,
            messageId,
            bookingId: incomingBookingId,
            senderId,
            preview: previewChatMessageContent(row.content),
            senderFirstName: cachedName
          });
          seenToastIdsRef.current = next.seenIds;
          if (next.toast) {
            setToast(next.toast);
            if (!cachedName && supabase) {
              void (async () => {
                const { allowed, partnerId, partnerName } = await verifyBookingChatParticipant(
                  supabase,
                  incomingBookingId,
                  userId
                );
                if (!allowed) return;
                if (senderId && partnerId && partnerId !== senderId) return;
                const firstName = firstNameFromPartnerDisplay(partnerName);
                if (!firstName) return;
                if (senderId) senderNameCacheRef.current.set(senderId, firstName);
                setToast((current) => withIncomingChatToastSenderName(current, messageId, firstName));
              })();
            }
          }
        }
      }

      void (async () => {
        if (sameOpen) {
          // Dedicated /chat route keeps existing mark-read behavior.
          // Inline ChatInterface marks read itself; toast suppression must not write read_at.
          if (viewingRoute && supabase) {
            await markBookingMessagesRead(supabase, viewingRoute, userId);
          }
          await refreshUnread();
          return;
        }

        if (viewingRoute && !incomingBookingId) {
          if (supabase) {
            await markBookingMessagesRead(supabase, viewingRoute, userId);
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

  const value = useMemo(() => ({ hasUnreadMessages }), [hasUnreadMessages]);
  const href = toast ? chatConversationHref(role, toast.bookingId) : null;

  return (
    <IncomingChatInboxContext.Provider value={value}>
      {children}
      <GlobalChatToast toast={toast} href={href} onDismiss={dismissToast} />
    </IncomingChatInboxContext.Provider>
  );
}
