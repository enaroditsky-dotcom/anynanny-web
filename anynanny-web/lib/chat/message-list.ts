import { sameBookingId } from "@/lib/chat/unread-messages";
import type { MessageRow } from "@/lib/chat/constants";

function coerceChatTimestamp(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber.toISOString();
  }
  return new Date().toISOString();
}

/** Coerce realtime/SELECT payloads so uuid/timestamp types still append. */
export function normalizeChatMessageRow(value: unknown): MessageRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const booking_id = String(row.booking_id ?? "").trim();
  const sender_id = String(row.sender_id ?? "").trim();
  if (!id || !booking_id || !sender_id) return null;
  const content = typeof row.content === "string" ? row.content : String(row.content ?? "");
  const read_at = row.read_at == null || row.read_at === "" ? null : String(row.read_at);
  return {
    id,
    booking_id,
    sender_id,
    content,
    created_at: coerceChatTimestamp(row.created_at),
    read_at
  };
}

export function isChatMessageRow(value: unknown): value is MessageRow {
  return normalizeChatMessageRow(value) != null;
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
