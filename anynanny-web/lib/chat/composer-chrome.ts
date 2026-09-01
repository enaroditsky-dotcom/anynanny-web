export const CHAT_COMPOSER_ACTIVE_EVENT = "anynanny-chat-composer-active";

/** Same inset family as AppShellGate / BottomNav — keep composer above chrome. */
export const CHAT_COMPOSER_SCROLL_MARGIN =
  "scroll-mb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]";

export function setChatComposerActive(active: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CHAT_COMPOSER_ACTIVE_EVENT, {
      detail: { active }
    })
  );
}

export function isNearScrollBottom(el: HTMLElement, thresholdPx = 80): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}
