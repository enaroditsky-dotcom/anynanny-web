import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAT_ELIGIBLE_BOOKING_STATUSES,
  shouldIncludeBookingInChatInbox
} from "../lib/chat/booking-messages";
import { openConversationBookingId, sameBookingId } from "../lib/chat/unread-messages";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(shouldIncludeBookingInChatInbox("approved", false), true);
assert.equal(shouldIncludeBookingInChatInbox("pending", false), true);
assert.equal(shouldIncludeBookingInChatInbox("cancelled", false), false);
assert.equal(shouldIncludeBookingInChatInbox("completed", false), false);
assert.equal(shouldIncludeBookingInChatInbox("cancelled", true), true);
assert.equal(shouldIncludeBookingInChatInbox("completed", true), true);
assert.equal(shouldIncludeBookingInChatInbox("rejected", true), false);
assert.ok(CHAT_ELIGIBLE_BOOKING_STATUSES.includes("approved"));

assert.equal(openConversationBookingId("/parent/messages"), null);
assert.equal(openConversationBookingId("/sitter/messages"), null);
assert.equal(openConversationBookingId("/parent/chat/abc-123"), "abc-123");
assert.equal(openConversationBookingId("/sitter/chat/abc-123"), "abc-123");
assert.equal(sameBookingId("ABC-123", "abc-123"), true);

const inbox = read("lib/chat/booking-messages.ts");
assert.match(inbox, /CHAT_INBOX_BOOKING_STATUSES/);
assert.match(inbox, /shouldIncludeBookingInChatInbox/);
assert.match(inbox, /\.in\("status", CHAT_INBOX_BOOKING_STATUSES\)/);

const parentMessages = read("app/parent/messages/page.tsx");
const sitterMessages = read("app/sitter/messages/page.tsx");
assert.doesNotMatch(parentMessages, /mark_booking_messages_read|markBookingMessagesRead/);
assert.doesNotMatch(sitterMessages, /mark_booking_messages_read|markBookingMessagesRead/);

const hook = read("features/chat/hooks/useChatNotification.ts");
assert.doesNotMatch(hook, /sessionStorage|localStorage|anynanny_chat_unread/);
assert.match(hook, /markBookingMessagesRead/);
assert.match(hook, /openConversationBookingId/);

const nav = read("components/bottom-nav.tsx");
assert.doesNotMatch(nav, /clearChatNotification|sessionStorage/);
assert.match(nav, /hasUnreadMessages/);

const chat = read("components/chat/ChatInterface.tsx");
assert.match(chat, /markBookingMessagesRead/);

const verify = read("lib/chat/booking-messages.ts");
assert.match(verify, /export async function verifyBookingChatParticipant/);
assert.doesNotMatch(
  verify.slice(verify.indexOf("export async function verifyBookingChatParticipant")),
  /status.*=.*approved/
);

console.log("chat inbox + unread helpers ok");
