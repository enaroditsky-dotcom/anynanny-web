import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  setMountedChatConversation,
  getMountedChatConversation
} from "../lib/chat/composer-chrome";
import {
  chatConversationHref,
  incomingChatToastMessageId,
  nextIncomingChatToast,
  shouldShowIncomingChatToast,
  withIncomingChatToastSenderName
} from "../lib/chat/incoming-chat-toast";
import {
  firstNameFromPartnerDisplay,
  formatIncomingChatToastBody,
  previewChatMessageContent
} from "../lib/chat/message-preview";
import { isViewingConversation, openConversationBookingId } from "../lib/chat/unread-messages";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

assert.equal(previewChatMessageContent("  שלום  "), "שלום");
assert.equal(previewChatMessageContent(""), "");
assert.equal(previewChatMessageContent(null), "");
assert.equal(previewChatMessageContent("א".repeat(80)), "א".repeat(80));
assert.equal(previewChatMessageContent("א".repeat(81)), `${"א".repeat(80)}…`);
assert.equal(firstNameFromPartnerDisplay("אריאל כהן"), "אריאל");
assert.equal(formatIncomingChatToastBody("אני כבר בדרך", "אריאל"), "אריאל: אני כבר בדרך");
assert.equal(formatIncomingChatToastBody("אני כבר בדרך", null), "אני כבר בדרך");
assert.equal(chatConversationHref("parent", "b1"), "/parent/chat/b1");
assert.equal(chatConversationHref("sitter", "b1"), "/sitter/chat/b1");

assert.equal(
  shouldShowIncomingChatToast({
    pathname: "/parent/dashboard",
    mountedBookingId: null,
    incomingBookingId: "booking-a"
  }),
  true
);
assert.equal(
  shouldShowIncomingChatToast({
    pathname: "/parent/chat/booking-a",
    mountedBookingId: null,
    incomingBookingId: "booking-a"
  }),
  false
);
assert.equal(
  shouldShowIncomingChatToast({
    pathname: "/parent/dashboard",
    mountedBookingId: "booking-a",
    incomingBookingId: "booking-a"
  }),
  false
);
assert.equal(
  shouldShowIncomingChatToast({
    pathname: "/parent/chat/booking-a",
    mountedBookingId: "booking-a",
    incomingBookingId: "booking-b"
  }),
  true
);
assert.equal(isViewingConversation("/sitter/chat/xyz", "xyz", null), true);
assert.equal(isViewingConversation("/sitter/profile", "xyz", "xyz"), true);
assert.equal(isViewingConversation("/sitter/profile", "xyz", "other"), false);
assert.equal(openConversationBookingId("/parent/messages"), null);

const first = nextIncomingChatToast({
  current: null,
  seenIds: new Set(),
  messageId: "m1",
  bookingId: "b1",
  senderId: "s1",
  preview: "שלום",
  senderFirstName: null
});
assert.equal(first.toast?.messageId, "m1");
assert.equal(first.toast?.title, "הודעה חדשה");
assert.equal(first.toast?.body, "שלום");

const duplicate = nextIncomingChatToast({
  current: first.toast,
  seenIds: first.seenIds,
  messageId: "m1",
  bookingId: "b1",
  preview: "שלום",
  senderFirstName: null
});
assert.equal(duplicate.toast?.messageId, "m1");
assert.equal(duplicate.seenIds.size, 1);

const second = nextIncomingChatToast({
  current: first.toast,
  seenIds: first.seenIds,
  messageId: "m2",
  bookingId: "b2",
  preview: "בדרך",
  senderFirstName: "אריאל"
});
assert.equal(second.toast?.messageId, "m2");
assert.equal(second.toast?.body, "אריאל: בדרך");
assert.equal(second.seenIds.has("m1"), true);
assert.equal(second.seenIds.has("m2"), true);

const named = withIncomingChatToastSenderName(first.toast, "m1", "אריאל");
assert.equal(named?.body, "אריאל: שלום");
assert.equal(withIncomingChatToastSenderName(first.toast, "other", "אריאל")?.body, "שלום");

assert.equal(
  incomingChatToastMessageId({ id: " mid ", booking_id: "b1", sender_id: "s1", content: "x" }),
  "mid"
);

setMountedChatConversation("inline-1");
assert.equal(getMountedChatConversation(), "inline-1");
setMountedChatConversation(null);
assert.equal(getMountedChatConversation(), null);

const provider = read("features/chat/incoming-chat-inbox-provider.tsx");
assert.equal(count(provider, "subscribeToIncomingMessages"), 1);
assert.match(provider, /notifyIncomingChatMessage/);
assert.match(provider, /IncomingChatInboxProvider/);
assert.match(provider, /GlobalChatToast/);
assert.match(provider, /shouldShowIncomingChatToast/);
assert.match(provider, /verifyBookingChatParticipant/);
assert.doesNotMatch(provider, /markBookingMessagesRead[\s\S]{0,80}dismissToast/);
assert.doesNotMatch(provider, /SUPABASE_SERVICE_ROLE|service_role/);
assert.match(provider, /Inline ChatInterface marks read itself/);

const toastUi = read("components/notifications/global-chat-toast.tsx");
assert.match(toastUi, /z-\[70\]/);
assert.match(toastUi, /pointer-events-auto/);
assert.doesNotMatch(toastUi, /pointer-events-none/);
assert.match(toastUi, /5\.5rem\+var\(--anynanny-now-dock/);
assert.match(toastUi, /CHAT_COMPOSER_ACTIVE_EVENT/);
assert.doesNotMatch(toastUi, /markBookingMessagesRead|mark_booking_messages_read/);
assert.doesNotMatch(toastUi, /ActionToast/);
assert.match(toastUi, /aria-label="סגור"/);
assert.match(toastUi, /router\.push\(href\)/);

const shell = read("components/app-shell-gate.tsx");
assert.match(shell, /IncomingChatInboxProvider/);
const chromelessReturn = shell.slice(shell.indexOf("if (chromeless)"), shell.indexOf("const mainLayout"));
assert.doesNotMatch(chromelessReturn, /IncomingChatInboxProvider|GlobalChatToast/);

const nav = read("components/bottom-nav.tsx");
assert.doesNotMatch(nav, /subscribeToIncomingMessages/);
assert.match(nav, /useChatNotification/);
assert.match(nav, /hasUnreadMessages/);

const hook = read("features/chat/hooks/useChatNotification.ts");
assert.doesNotMatch(hook, /subscribeToIncomingMessages/);
assert.match(hook, /incoming-chat-inbox-provider/);

const chat = read("components/chat/ChatInterface.tsx");
assert.match(chat, /setMountedChatConversation\(bookingId\)/);
assert.match(chat, /setChatComposerActive\(true\)/);
assert.match(chat, /setChatComposerActive\(false\)/);
assert.match(chat, /text-\[16px\]/);
assert.doesNotMatch(chat, /CHAT_GRACE_PERIOD/);

const lifecycle = read("lib/chat/chat-lifecycle.ts");
assert.match(lifecycle, /CHAT_GRACE_PERIOD_MS = 24 \* 60 \* 60 \* 1000/);

const service = read("features/chat/services/chatService.ts");
assert.match(service, /user-chat-inbox-\$\{userId\}/);
assert.doesNotMatch(service, /filter:\s*`sender_id/);

console.log("global chat toast contract ok");
