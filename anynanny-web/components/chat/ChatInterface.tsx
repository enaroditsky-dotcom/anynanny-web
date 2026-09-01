'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { WhatsAppHandoffAction } from '@/components/chat/whatsapp-handoff-action';
import { BOOKINGS_TABLE } from '@/lib/bookings/constants';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { removeRealtimeChannel, subscribePostgresChanges } from '@/lib/supabase/subscribe-postgres-changes';
import { fetchBookingChatLifecycle, fetchBookingMessages, sendBookingMessage } from '@/lib/chat/booking-messages';
import { getChatLifecycle, type ChatLifecycle } from '@/lib/chat/chat-lifecycle';
import {
  getMountedChatConversation,
  isNearScrollBottom,
  setChatComposerActive,
  setMountedChatConversation
} from '@/lib/chat/composer-chrome';
import { MESSAGES_TABLE, type MessageRow } from '@/lib/chat/constants';
import {
  appendIncomingChatMessage,
  isChatMessageRow,
  mergeFetchedChatMessages
} from '@/lib/chat/message-list';
import { markBookingMessagesRead, notifyChatUnreadChanged, sameBookingId } from '@/lib/chat/unread-messages';
import { resolveWhatsAppHandoffStatus } from '@/lib/chat/whatsapp-handoff';

export default function ChatInterface({
  bookingId,
  userId,
  bookingStatus: bookingStatusProp
}: {
  bookingId: string;
  userId: string;
  bookingStatus?: string | null;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [lifecycle, setLifecycle] = useState<ChatLifecycle | null>(null);
  const [fetchedStatus, setFetchedStatus] = useState<string | null>(null);
  const handoffStatus = resolveWhatsAppHandoffStatus(bookingStatusProp, fetchedStatus);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const blurHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    setMountedChatConversation(bookingId);
    return () => {
      if (sameBookingId(getMountedChatConversation(), bookingId)) {
        setMountedChatConversation(null);
      }
    };
  }, [bookingId]);

  const markConversationRead = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !bookingId || !userId) return;
    const { ok } = await markBookingMessagesRead(supabase, bookingId, userId);
    if (ok) notifyChatUnreadChanged();
  }, [bookingId, userId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !bookingId || !userId) return;
    let cancelled = false;

    setMessages([]);
    setLifecycle(null);
    setFetchedStatus(null);

    void (async () => {
      await markConversationRead();
      if (cancelled) return;

      const { messages: fetched, error } = await fetchBookingMessages(supabase, bookingId);
      if (cancelled || error || !fetched) return;
      setMessages((prev) => mergeFetchedChatMessages(fetched, prev));
    })();

    void (async () => {
      const state = await fetchBookingChatLifecycle(supabase, bookingId);
      if (cancelled || state.error) return;
      if (state.status) setFetchedStatus(state.status);
      setLifecycle(
        getChatLifecycle(
          {
            status: state.status,
            cancelledAt: state.cancelledAt,
            actualEndTime: state.actualEndTime,
            sessionEndTime: state.sessionEndTime,
            scheduledEndTime: state.scheduledEndTime
          },
          Date.now()
        )
      );
    })();

    const channel = subscribePostgresChanges(
      supabase,
      `chat-${bookingId}`,
      [
        {
          event: 'INSERT',
          table: MESSAGES_TABLE,
          filter: `booking_id=eq.${bookingId}`,
          handler: (payload) => {
            if (!isChatMessageRow(payload.new)) return;
            const incoming = payload.new;
            setMessages((prev) => appendIncomingChatMessage(prev, incoming, bookingId));
            if (incoming.sender_id !== userId) {
              void markConversationRead();
            }
          }
        },
        {
          event: 'UPDATE',
          table: BOOKINGS_TABLE,
          filter: `id=eq.${bookingId}`,
          handler: (payload) => {
            const next = payload.new as { id?: unknown; status?: unknown } | null;
            if (!next || String(next.id ?? "") !== bookingId) return;
            const nextStatus = typeof next.status === "string" ? next.status.trim() : "";
            if (nextStatus) setFetchedStatus(nextStatus);
          }
        }
      ],
      (status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[ChatInterface] realtime:', status, err?.message);
        }
      }
    );

    return () => {
      cancelled = true;
      removeRealtimeChannel(supabase, channel);
      if (blurHideTimerRef.current) clearTimeout(blurHideTimerRef.current);
      setChatComposerActive(false);
    };
  }, [bookingId, userId, markConversationRead]);

  useEffect(() => {
    if (lifecycle?.closed) {
      if (blurHideTimerRef.current) clearTimeout(blurHideTimerRef.current);
      setComposerFocused(false);
      setChatComposerActive(false);
    }
  }, [lifecycle?.closed]);

  const revealComposer = useCallback(() => {
    composerRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, []);

  useEffect(() => {
    if (!composerFocused) return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const onViewportResize = () => {
      revealComposer();
    };
    viewport.addEventListener("resize", onViewportResize);
    return () => {
      viewport.removeEventListener("resize", onViewportResize);
    };
  }, [composerFocused, revealComposer]);

  useEffect(() => {
    const onWindowScroll = () => {
      const list = messageListRef.current;
      if (list && list.scrollHeight > list.clientHeight + 4) return;
      const scrolling = (document.scrollingElement ?? document.documentElement) as HTMLElement;
      stickToBottomRef.current = isNearScrollBottom(scrolling, 120);
    };
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll);
  }, []);

  useEffect(() => {
    if (composerFocused) return;
    if (!stickToBottomRef.current) return;

    const list = messageListRef.current;
    if (list && list.scrollHeight > list.clientHeight + 4) {
      list.scrollTop = list.scrollHeight;
      return;
    }
    const scrolling = (document.scrollingElement ?? document.documentElement) as HTMLElement;
    scrolling.scrollTop = scrolling.scrollHeight;
  }, [messages, composerFocused]);

  const onMessageListScroll = () => {
    const list = messageListRef.current;
    if (!list) return;
    if (list.scrollHeight <= list.clientHeight + 4) {
      stickToBottomRef.current = true;
      return;
    }
    stickToBottomRef.current = isNearScrollBottom(list);
  };

  const sendMessageHandler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || lifecycle?.writable === false) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const currentText = newMessage.trim();
    setSending(true);

    const { message, error } = await sendBookingMessage(supabase, bookingId, userId, currentText);

    if (!error && message) {
      setNewMessage('');
      stickToBottomRef.current = true;
      setMessages((prev) => appendIncomingChatMessage(prev, message, bookingId));
    } else if (error) {
      console.error("[ChatInterface] Failed to send message:", error);
    }
    setSending(false);
  };

  return (
    <div
      className="flex flex-col bg-gray-50 md:h-[400px] md:overflow-hidden md:rounded-lg md:border"
      dir="rtl"
    >
      <WhatsAppHandoffAction
        bookingId={bookingId}
        bookingStatus={handoffStatus}
        onIneligible={() => {
          void (async () => {
            const client = getSupabaseBrowserClient();
            if (!client) {
              setFetchedStatus("completed");
              return;
            }
            const state = await fetchBookingChatLifecycle(client, bookingId);
            setFetchedStatus(state.status ?? "completed");
          })();
        }}
      />
      <div
        ref={messageListRef}
        onScroll={onMessageListScroll}
        className="space-y-4 p-4 md:min-h-0 md:flex-1 md:overflow-y-auto"
      >
        {messages.map((m) => (
          <div 
            key={m.id} 
            className={`flex ${m.sender_id === userId ? 'justify-start' : 'justify-end'}`}
          >
            <div className={`max-w-[80%] p-3 rounded-2xl shadow-sm text-right text-sm leading-relaxed ${
              m.sender_id === userId 
                ? 'bg-blue-600 text-white rounded-br-none' 
                : 'bg-white text-gray-800 rounded-bl-none border border-slate-100'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        <div
          ref={messagesEndRef}
          className="scroll-mb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]"
        />
      </div>

      {lifecycle?.closed ? (
        <div className="border-t bg-slate-50 px-4 py-3 text-right scroll-mb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]">
          <p className="text-sm font-semibold text-slate-700">{lifecycle.closedHeadline}</p>
          {lifecycle.closedSupport ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{lifecycle.closedSupport}</p>
          ) : null}
        </div>
      ) : (
      <form
        ref={composerRef}
        onSubmit={sendMessageHandler}
        className="flex items-center gap-2 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:pb-3 scroll-mb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]"
      >
        <input 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onFocus={() => {
            if (blurHideTimerRef.current) {
              clearTimeout(blurHideTimerRef.current);
              blurHideTimerRef.current = null;
            }
            setComposerFocused(true);
            setChatComposerActive(true);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => revealComposer());
            });
          }}
          onBlur={() => {
            if (blurHideTimerRef.current) clearTimeout(blurHideTimerRef.current);
            blurHideTimerRef.current = setTimeout(() => {
              setComposerFocused(false);
              setChatComposerActive(false);
            }, 250);
          }}
          disabled={sending}
          enterKeyHint="send"
          autoComplete="off"
          className="min-h-11 flex-1 rounded-full border border-slate-200 px-4 py-2 text-[16px] leading-normal text-right focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
          placeholder="הקלד הודעה..."
        />
        <button 
          type="submit" 
          disabled={!newMessage.trim() || sending}
          className="min-h-11 rounded-full bg-blue-600 px-5 py-2 text-base font-bold text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
        >
          {sending ? 'שולח...' : 'שלח'}
        </button>
      </form>
      )}
    </div>
  );
}
