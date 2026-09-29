import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterVisibleConversations,
  isConversationHiddenForUser
} from "../lib/chat/chat-visibility";
import {
  CHAT_INBOX_VISIBLE_CARDS,
  chatInboxListMaxHeight,
  chatInboxListUsesInternalScroll
} from "../lib/chat/inbox-list-layout";
import {
  conversationMatchesInboxQuery,
  inboxSearchHasNoMatches
} from "../lib/chat/inbox-search";
import {
  activeSwipeFrame,
  reduceSwipeCancel,
  reduceSwipeRelease,
  shouldClaimHorizontalTouch,
  SWIPE_DELETE_THRESHOLD_PX,
  SWIPE_DEADZONE_PX
} from "../lib/chat/swipe-to-delete";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const openRow = {
  booking_id: "booking-open",
  partner_name: "נועה כהן",
  partner_public_id: "AN-1004",
  last_message_at: "2026-09-20T10:00:00.000Z"
};
const pastRow = {
  booking_id: "booking-past",
  partner_name: "דנה לוי",
  partner_public_id: "P-2208",
  last_message_at: "2026-08-01T10:00:00.000Z"
};

assert.equal(conversationMatchesInboxQuery(openRow, "AN-1004"), true);
assert.equal(conversationMatchesInboxQuery(openRow, "an-1004"), true);
assert.equal(conversationMatchesInboxQuery(pastRow, "AN-1004"), false);

assert.equal(conversationMatchesInboxQuery(openRow, "1004"), true);
assert.equal(conversationMatchesInboxQuery(pastRow, "2208"), true);
assert.equal(conversationMatchesInboxQuery(openRow, "2208"), false);

assert.equal(conversationMatchesInboxQuery(openRow, "נועה"), true);
assert.equal(conversationMatchesInboxQuery(pastRow, "דנה לוי"), true);
assert.equal(conversationMatchesInboxQuery(openRow, "דנה"), false);

assert.equal(conversationMatchesInboxQuery(openRow, ""), true);
assert.equal(conversationMatchesInboxQuery(pastRow, "   "), true);

const noResultQuery = "אין-שיחה-כזו";
const matches = [openRow, pastRow].filter((row) => conversationMatchesInboxQuery(row, noResultQuery));
assert.equal(matches.length, 0);
assert.equal(inboxSearchHasNoMatches(noResultQuery, matches.length), true);
assert.equal(inboxSearchHasNoMatches("", 0), false);
assert.equal(inboxSearchHasNoMatches("נועה", 1), false);

assert.equal(CHAT_INBOX_VISIBLE_CARDS, 3);
assert.equal(chatInboxListMaxHeight(), "16.75rem");
assert.equal(chatInboxListUsesInternalScroll(1), false);
assert.equal(chatInboxListUsesInternalScroll(2), false);
assert.equal(chatInboxListUsesInternalScroll(3), false);
assert.equal(chatInboxListUsesInternalScroll(4), true);

const inbox = read("components/chat/booking-chat-inbox.tsx");
const section = inbox.slice(inbox.indexOf("function ConversationSection"), inbox.indexOf("function BookingChatInbox"));
const headingAt = section.indexOf("<h2");
const listAt = section.indexOf("data-chat-list-scroll");
assert.ok(headingAt >= 0 && listAt > headingAt);
assert.equal(section.slice(listAt).includes("<h2"), false);
assert.match(section, /overflow-y-auto/);
assert.match(section, /overflow-x-hidden/);
assert.match(section, /\[-webkit-overflow-scrolling:touch\]/);
assert.match(section, /maxHeight: chatInboxListMaxHeight\(\)/);
assert.doesNotMatch(section, /minHeight:\s*chatInboxListMaxHeight|h-dvh|h-screen|overflow-y-hidden/);
assert.match(section, /שיחות פתוחות|title/);

assert.match(inbox, /שיחות פתוחות/);
assert.match(inbox, /שיחות קודמות/);
assert.match(inbox, /aria-label="חיפוש לפי שם או ID"/);
assert.match(inbox, /placeholder="חיפוש לפי שם או ID"/);
assert.match(inbox, /לא נמצאה שיחה מתאימה/);
assert.match(inbox, /setQuery\(event\.target\.value\)/);
assert.match(inbox, /href=\{chatHref\(row\.booking_id\)\}/);
assert.match(inbox, /aria-label=\{`מחיקת השיחה עם \$\{partnerLabel\}`\}/);
assert.match(inbox, /touchAction: "pan-y"/);
assert.match(inbox, /addEventListener\("touchmove", onTouchMove, \{ passive: false, capture: true \}\)/);
assert.match(inbox, /event\.preventDefault\(\)/);
assert.match(inbox, /translate3d\(\$\{px\}px, 0, 0\)/);
assert.match(inbox, /pointerType === "touch"/);
assert.match(inbox, /activeSwipeFrame/);
assert.match(inbox, /shouldClaimHorizontalTouch/);
assert.match(inbox, /swipeReleaseAction\(dx\) === "confirm"/);
assert.match(inbox, /paintOffset\(0, true\)/);
assert.match(inbox, /setSnapBackSignal/);
assert.match(inbox, /bg-rose-600/);
assert.match(inbox, /\[@media\(hover:hover\)\]:group-hover:opacity-100/);
assert.doesNotMatch(inbox, /window\.confirm|document\.body\.style\.overflow/);
assert.doesNotMatch(inbox, /h-dvh|h-screen/);

const parentPage = read("app/parent/messages/page.tsx");
const sitterPage = read("app/sitter/messages/page.tsx");
assert.match(parentPage, /\/parent\/chat\//);
assert.match(sitterPage, /\/sitter\/chat\//);
assert.doesNotMatch(parentPage, /h-dvh|h-screen|overflow-hidden/);
assert.doesNotMatch(sitterPage, /h-dvh|h-screen|overflow-hidden/);

const shell = read("components/app-shell-gate.tsx");
assert.match(shell, /overflow-y-auto/);
assert.match(shell, /APP_SHELL_SCROLL_ID/);

const below = reduceSwipeRelease(-(SWIPE_DELETE_THRESHOLD_PX - 1), 0);
assert.equal(below.confirmOpen, false);
assert.equal(below.offsetPx, 0);

const tiny = reduceSwipeRelease(-(SWIPE_DEADZONE_PX - 1), 0);
assert.equal(tiny.confirmOpen, false);
assert.equal(tiny.offsetPx, 0);

const vertical = reduceSwipeRelease(-SWIPE_DELETE_THRESHOLD_PX - 20, -SWIPE_DELETE_THRESHOLD_PX - 40);
assert.equal(vertical.confirmOpen, false);
assert.equal(vertical.offsetPx, 0);

const above = reduceSwipeRelease(-SWIPE_DELETE_THRESHOLD_PX, 0);
assert.equal(above.confirmOpen, true);
assert.ok(above.offsetPx <= -SWIPE_DELETE_THRESHOLD_PX);

const cancelled = reduceSwipeCancel();
assert.equal(cancelled.confirmOpen, false);
assert.equal(cancelled.offsetPx, 0);

const following = activeSwipeFrame(-64, -8, "undecided");
assert.equal(following.axis, "horizontal");
assert.equal(following.offsetPx, -64);
assert.equal(following.blockScroll, true);

const jitter = activeSwipeFrame(-8, 3, "undecided");
assert.equal(jitter.axis, "undecided");
assert.equal(jitter.offsetPx, 0);
assert.equal(jitter.blockScroll, false);

const verticalScroll = activeSwipeFrame(-18, -40, "undecided");
assert.equal(verticalScroll.axis, "vertical");
assert.equal(verticalScroll.offsetPx, 0);
assert.equal(verticalScroll.blockScroll, false);

const staysHorizontal = activeSwipeFrame(-70, -90, "horizontal");
assert.equal(staysHorizontal.axis, "horizontal");
assert.equal(staysHorizontal.offsetPx, -70);
assert.equal(staysHorizontal.blockScroll, true);

assert.equal(shouldClaimHorizontalTouch(-9, -2, "undecided"), true);
assert.equal(shouldClaimHorizontalTouch(-9, -2, "undecided") && activeSwipeFrame(-9, -2, "undecided").offsetPx === 0, true);
assert.equal(shouldClaimHorizontalTouch(-6, -14, "undecided"), false);
assert.equal(shouldClaimHorizontalTouch(-40, -4, "horizontal"), true);

const dialog = read("components/chat/delete-conversation-dialog.tsx");
assert.match(dialog, /בטוח למחוק את הצ'ט הזה\?/);
assert.match(dialog, />\s*לא\s*</);
assert.match(dialog, /כן, למחוק/);
assert.match(dialog, /bg-rose-600/);
assert.match(dialog, /role="dialog"/);
assert.match(dialog, /aria-modal="true"/);
assert.match(dialog, /event\.key === "Escape"/);
assert.match(dialog, /cancelRef\.current\?\.focus\(\)/);
assert.doesNotMatch(dialog, /window\.confirm/);

const hiddenAt = "2026-09-20T12:00:00.000Z";
const parentHides = { [openRow.booking_id]: hiddenAt };
const sitterHides = {};
assert.equal(isConversationHiddenForUser(hiddenAt, openRow.last_message_at), true);
assert.equal(filterVisibleConversations([openRow, pastRow], parentHides).some((row) => row.booking_id === openRow.booking_id), false);
assert.equal(filterVisibleConversations([openRow, pastRow], parentHides).some((row) => row.booking_id === pastRow.booking_id), true);
assert.equal(filterVisibleConversations([openRow, pastRow], sitterHides).length, 2);

const restored = { ...openRow, last_message_at: "2026-09-20T12:00:01.000Z" };
assert.equal(isConversationHiddenForUser(hiddenAt, restored.last_message_at), false);
assert.equal(filterVisibleConversations([restored], parentHides).length, 1);

const newBooking = {
  booking_id: "booking-new",
  last_message_at: "2026-09-21T09:00:00.000Z"
};
assert.equal(filterVisibleConversations([newBooking], parentHides).length, 1);

const bookingMessages = read("lib/chat/booking-messages.ts");
const hideStart = bookingMessages.indexOf("export async function hideBookingChatForUser");
const hideEnd = bookingMessages.indexOf("async function fetchBookingsWithMessagesForUser");
const hideFn = bookingMessages.slice(hideStart, hideEnd);
assert.ok(hideStart >= 0 && hideEnd > hideStart);
assert.match(hideFn, /BOOKING_CHAT_HIDES_TABLE/);
assert.match(hideFn, /user_id: uid/);
assert.match(hideFn, /booking_id: id/);
assert.doesNotMatch(hideFn, /\.delete\(|MESSAGES_TABLE|from\("messages"\)/);
assert.match(bookingMessages, /filterVisibleConversations\(rows, hides\)/);
assert.match(bookingMessages, /loadBookingChatHides/);

const migration = read("supabase/migrations/20260929093305_booking_chat_hides.sql");
assert.match(migration, /create table if not exists public\.booking_chat_hides/);
assert.match(migration, /enable row level security/);
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
assert.match(migration, /b\.parent_id = \(select auth\.uid\(\)\)/);
assert.match(migration, /b\.sitter_id = \(select auth\.uid\(\)\)/);
assert.match(migration, /grant select, insert, update on table public\.booking_chat_hides to authenticated/);
assert.doesNotMatch(migration, /grant\s+delete/i);
assert.doesNotMatch(migration, /for delete/);
assert.doesNotMatch(migration, /delete\s+from/i);
assert.doesNotMatch(migration, /drop\s+table/i);
assert.doesNotMatch(migration, /using \(true\)/);
assert.doesNotMatch(migration, /public\.messages/);

console.log("chat inbox ux ok");
