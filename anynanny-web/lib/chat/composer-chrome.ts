export const CHAT_COMPOSER_ACTIVE_EVENT = "anynanny-chat-composer-active";
export const CHAT_OPEN_CONVERSATION_EVENT = "anynanny-chat-open-conversation";

/** Same inset family as AppShellGate / BottomNav — keep composer above chrome. */
export const CHAT_COMPOSER_SCROLL_MARGIN =
  "scroll-mb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]";

let mountedConversationBookingId: string | null = null;

function normalizeBookingId(bookingId: string | null | undefined): string | null {
  const next = typeof bookingId === "string" ? bookingId.trim() : "";
  return next || null;
}

/** Currently mounted ChatInterface booking, including inline dashboard chat. */
export function getMountedChatConversation(): string | null {
  return mountedConversationBookingId;
}

export function setMountedChatConversation(bookingId: string | null): void {
  mountedConversationBookingId = normalizeBookingId(bookingId);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CHAT_OPEN_CONVERSATION_EVENT, {
      detail: { bookingId: mountedConversationBookingId }
    })
  );
}

export function setChatComposerActive(active: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CHAT_COMPOSER_ACTIVE_EVENT, {
      detail: {
        active,
        bookingId: active ? mountedConversationBookingId : null
      }
    })
  );
}

export function isNearScrollBottom(el: HTMLElement, thresholdPx = 80): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}
