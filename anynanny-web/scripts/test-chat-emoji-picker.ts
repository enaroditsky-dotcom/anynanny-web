import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_EMOJI_CATALOG } from "../lib/chat/chat-emoji-catalog";
import {
  insertTextAtSelection,
  isChatDraftSendable,
  nextEmojiPickerOpen
} from "../lib/chat/emoji-insert";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const smile = CHAT_EMOJI_CATALOG[0];
assert.equal(smile, "😀");

const one = insertTextAtSelection("", smile, 0, 0);
assert.equal(one.value, smile);
assert.equal(one.selectionStart, smile.length);
assert.equal(isChatDraftSendable(one.value), true);

const intoExisting = insertTextAtSelection("שלום", "👍", 4, 4);
assert.equal(intoExisting.value, "שלום👍");
assert.equal(isChatDraftSendable(intoExisting.value), true);

const mid = insertTextAtSelection("Hi there", "🎉", 2, 2);
assert.equal(mid.value, "Hi🎉 there");
assert.equal(mid.selectionStart, 2 + "🎉".length);

const replaced = insertTextAtSelection("hello", "👋", 1, 4);
assert.equal(replaced.value, "h👋o");

const missingCaret = insertTextAtSelection("abc", "❤", null, null);
assert.equal(missingCaret.value, "abc❤");

const textPlusEmoji = insertTextAtSelection("נתראה מחר ", "😊", "נתראה מחר ".length, "נתראה מחר ".length);
assert.equal(textPlusEmoji.value, "נתראה מחר 😊");
assert.equal(isChatDraftSendable(textPlusEmoji.value), true);

assert.equal(isChatDraftSendable("   "), false);
assert.equal(isChatDraftSendable("🫡"), true);
assert.equal(isChatDraftSendable(" 🎉 "), true);

assert.equal(nextEmojiPickerOpen(false, "toggle"), true);
assert.equal(nextEmojiPickerOpen(true, "toggle"), false);
assert.equal(nextEmojiPickerOpen(true, "outside"), false);
assert.equal(nextEmojiPickerOpen(true, "escape"), false);
assert.equal(nextEmojiPickerOpen(true, "select"), true);
assert.equal(nextEmojiPickerOpen(false, "select"), false);

assert.ok(CHAT_EMOJI_CATALOG.length >= 48);
assert.equal(new Set(CHAT_EMOJI_CATALOG).size, CHAT_EMOJI_CATALOG.length);

const chat = read("components/chat/ChatInterface.tsx");
assert.match(chat, /ChatComposerEmojiControl/);
assert.match(chat, /insertTextAtSelection/);
assert.match(chat, /insertEmoji/);
assert.match(chat, /sendBookingMessage/);
assert.match(chat, /newMessage\.trim\(\)/);
assert.doesNotMatch(chat, /insertEmoji[\s\S]{0,80}sendBookingMessage/);
assert.match(chat, /min-h-\[12\.5rem\]/);
assert.match(chat, /min-w-0 flex-1/);
assert.match(chat, /min-h-11 shrink-0 rounded-full bg-blue-600/);
assert.match(chat, /text-\[16px\]/);
assert.doesNotMatch(chat, /from\("messages"\)\.insert/);

const picker = read("components/chat/chat-emoji-picker.tsx");
assert.match(picker, /data-chat-emoji-toggle/);
assert.match(picker, /data-chat-emoji-picker/);
assert.match(picker, /type="button"/);
assert.match(picker, /onInsert\(emoji\)/);
assert.doesNotMatch(picker, /sendBookingMessage|onSubmit|type="submit"/);
assert.match(picker, /Escape/);
assert.match(picker, /pointerdown/);
assert.match(picker, /bottom-full/);
assert.match(picker, /left-2 right-2/);
assert.match(picker, /max-h-\[min\(12rem,36svh\)\]/);
assert.match(picker, /overscroll-contain/);
assert.doesNotMatch(picker, /fixed bottom-0|sticky bottom/);
assert.match(picker, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(picker, /aria-label="הוספת אימוג'י"/);
assert.match(picker, /from "lucide-react"/);
assert.match(picker, /Smile/);
assert.doesNotMatch(picker, /emoji-mart|emoji-picker-react|frimousse/);

const parentRoom = read("components/chat/parent-chat-room.tsx");
assert.match(parentRoom, /ChatInterface/);
assert.doesNotMatch(parentRoom, /ChatComposerEmojiControl/);

const parentPage = read("app/parent/chat/[bookingId]/page.tsx");
const sitterPage = read("app/sitter/chat/[bookingId]/page.tsx");
assert.match(parentPage, /BookingChat/);
assert.match(sitterPage, /BookingChat/);
assert.doesNotMatch(parentPage, /play-twa|AndroidManifest/);
assert.doesNotMatch(sitterPage, /play-twa|AndroidManifest/);

const send = read("lib/chat/booking-messages.ts");
const sendFn = send.slice(send.indexOf("export async function sendBookingMessage"));
assert.match(sendFn, /const trimmed = content\.trim\(\)/);
assert.doesNotMatch(sendFn.slice(0, 900), /replace\(|encodeURIComponent|Buffer|btoa/);

const pkg = read("package.json");
assert.doesNotMatch(pkg, /emoji-mart|emoji-picker-react|@emoji-mart|frimousse/);

console.log("chat emoji picker contract ok");
