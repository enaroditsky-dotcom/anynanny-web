import { sameBookingId } from "@/lib/chat/unread-messages";
import type { MessageRow } from "@/lib/chat/constants";

export function isChatMessageRow(value: unknown): value is MessageRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.trim().length > 0 &&
    typeof row.booking_id === "string" &&
    typeof row.sender_id === "string" &&
    typeof row.content === "string" &&
    typeof row.created_at === "string"
  );
}

/** Append a realtime/optimistic message without duplicating canonical ids. */
export function appendIncomingChatMessage(
  current: MessageRow[],
  incoming: MessageRow,
  bookingId?: string
): MessageRow[] {
  if (!incoming.id) return current;
  if (bookingId && !sameBookingId(incoming.booking_id, bookingId)) return current;
  if (current.some((m) => m.id === incoming.id)) return current;
  return [...current, incoming];
}

/**
 * Replace with the fetched history while keeping any live rows that arrived
 * during the request (so a realtime INSERT is not wiped by a slower SELECT).
 */
export function mergeFetchedChatMessages(fetched: MessageRow[], live: MessageRow[]): MessageRow[] {
  const byId = new Map<string, MessageRow>();
  for (const row of fetched) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of live) {
    if (row?.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}
