/**
 * Soft-hide storage for the booking chat inbox.
 *
 * A row means "this user hid this booking conversation at hidden_at".
 * Messages are never deleted. The other participant has their own row, or none.
 *
 * Visibility returns when the conversation's last activity is newer than hidden_at.
 * Last activity is the latest message time, or booking.updated_at when the
 * conversation has no messages yet. A different booking id is a new conversation
 * and is not covered by an older hide.
 */
export const BOOKING_CHAT_HIDES_TABLE = "booking_chat_hides" as const;

export type ConversationActivity = {
  booking_id: string;
  last_message_at: string;
};

export function isConversationHiddenForUser(
  hiddenAt: string | null | undefined,
  lastActivityAt: string | null | undefined
): boolean {
  if (typeof hiddenAt !== "string" || !hiddenAt.trim()) return false;
  const hiddenMs = Date.parse(hiddenAt);
  if (!Number.isFinite(hiddenMs)) return false;
  const activityMs = typeof lastActivityAt === "string" ? Date.parse(lastActivityAt) : Number.NaN;
  if (!Number.isFinite(activityMs)) return true;
  return activityMs <= hiddenMs;
}

export function filterVisibleConversations<T extends ConversationActivity>(
  rows: readonly T[],
  hides: ReadonlyMap<string, string> | Readonly<Record<string, string | null | undefined>>
): T[] {
  const hiddenAtFor = (bookingId: string): string | null | undefined => {
    if (hides instanceof Map) return hides.get(bookingId);
    const record = hides as Readonly<Record<string, string | null | undefined>>;
    return record[bookingId];
  };
  return rows.filter(
    (row) => !isConversationHiddenForUser(hiddenAtFor(row.booking_id), row.last_message_at)
  );
}
