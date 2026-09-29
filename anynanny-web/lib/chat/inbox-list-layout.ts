/** How many conversation cards a section list shows before it scrolls internally. */
export const CHAT_INBOX_VISIBLE_CARDS = 3;

/**
 * Approximate block size of one inbox card, including padding, name, schedule,
 * the optional lifecycle line, and the border.
 */
export const CHAT_INBOX_CARD_REM = 5.25;

/** Tailwind space-y-2 gap between cards. */
export const CHAT_INBOX_CARD_GAP_REM = 0.5;

/** Max height for about three cards. Shorter lists stay content-sized. */
export function chatInboxListMaxHeight(): string {
  const cards = CHAT_INBOX_VISIBLE_CARDS;
  const rem = cards * CHAT_INBOX_CARD_REM + (cards - 1) * CHAT_INBOX_CARD_GAP_REM;
  return `${rem}rem`;
}

export function chatInboxListUsesInternalScroll(itemCount: number): boolean {
  return itemCount > CHAT_INBOX_VISIBLE_CARDS;
}
