import { formatIncomingChatToastBody } from "@/lib/chat/message-preview";
import {
  isViewingConversation,
  type IncomingChatMessageRow
} from "@/lib/chat/unread-messages";

export const INCOMING_CHAT_TOAST_DURATION_MS = 4500;
export const INCOMING_CHAT_TOAST_TITLE = "הודעה חדשה";
const SEEN_MESSAGE_ID_CAP = 40;

export type IncomingChatToastState = {
  messageId: string;
  bookingId: string;
  senderId: string;
  title: string;
  preview: string;
  body: string;
  senderFirstName: string | null;
};

export function chatConversationHref(role: "parent" | "sitter", bookingId: string): string {
  const id = bookingId.trim();
  return `/${role}/chat/${encodeURIComponent(id)}`;
}

export function incomingChatToastMessageId(row: IncomingChatMessageRow): string | null {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (id) return id;
  const bookingId = typeof row.booking_id === "string" ? row.booking_id.trim() : "";
  const senderId = typeof row.sender_id === "string" ? row.sender_id.trim() : "";
  const content = typeof row.content === "string" ? row.content.trim() : "";
  if (!bookingId) return null;
  return `${bookingId}:${senderId}:${content}`;
}

export function shouldShowIncomingChatToast(args: {
  pathname: string | null;
  mountedBookingId: string | null;
  incomingBookingId: string | null | undefined;
}): boolean {
  const incoming = String(args.incomingBookingId ?? "").trim();
  if (!incoming) return false;
  return !isViewingConversation(args.pathname, incoming, args.mountedBookingId);
}

function capSeenIds(seenIds: Set<string>): Set<string> {
  if (seenIds.size <= SEEN_MESSAGE_ID_CAP) return seenIds;
  const next = new Set(seenIds);
  while (next.size > SEEN_MESSAGE_ID_CAP) {
    const oldest = next.values().next().value;
    if (typeof oldest !== "string") break;
    next.delete(oldest);
  }
  return next;
}

function toastFromParts(args: {
  messageId: string;
  bookingId: string;
  senderId: string;
  preview: string;
  senderFirstName: string | null;
}): IncomingChatToastState {
  return {
    messageId: args.messageId,
    bookingId: args.bookingId,
    senderId: args.senderId,
    title: INCOMING_CHAT_TOAST_TITLE,
    preview: args.preview,
    body: formatIncomingChatToastBody(args.preview, args.senderFirstName),
    senderFirstName: args.senderFirstName
  };
}

/** Newest toast replaces the previous one. Same message id is ignored. */
export function nextIncomingChatToast(args: {
  current: IncomingChatToastState | null;
  seenIds: Set<string>;
  messageId: string;
  bookingId: string;
  senderId?: string;
  preview: string;
  senderFirstName: string | null;
}): { toast: IncomingChatToastState | null; seenIds: Set<string> } {
  const messageId = args.messageId.trim();
  const bookingId = args.bookingId.trim();
  if (!messageId || !bookingId) {
    return { toast: args.current, seenIds: args.seenIds };
  }
  if (args.seenIds.has(messageId)) {
    return { toast: args.current, seenIds: args.seenIds };
  }

  const seenIds = capSeenIds(new Set(args.seenIds));
  seenIds.add(messageId);

  return {
    toast: toastFromParts({
      messageId,
      bookingId,
      senderId: args.senderId?.trim() ?? "",
      preview: args.preview,
      senderFirstName: args.senderFirstName
    }),
    seenIds
  };
}

export function withIncomingChatToastSenderName(
  toast: IncomingChatToastState | null,
  messageId: string,
  senderFirstName: string | null
): IncomingChatToastState | null {
  if (!toast || toast.messageId !== messageId) return toast;
  const name = senderFirstName?.trim() || null;
  if (!name) return toast;
  return toastFromParts({
    messageId: toast.messageId,
    bookingId: toast.bookingId,
    senderId: toast.senderId,
    preview: toast.preview,
    senderFirstName: name
  });
}
