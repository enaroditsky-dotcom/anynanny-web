import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendIncomingChatMessage,
  isChatMessageRow,
  mergeFetchedChatMessages
} from "../lib/chat/message-list";
import type { MessageRow } from "../lib/chat/constants";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function row(partial: Partial<MessageRow> & Pick<MessageRow, "id">): MessageRow {
  return {
    booking_id: "booking-a",
    sender_id: "user-1",
    content: "hi",
    created_at: "2026-09-01T12:00:00.000Z",
    ...partial
  };
}

const first = row({ id: "m1", content: "one", created_at: "2026-09-01T12:00:00.000Z" });
const second = row({ id: "m2", content: "two", created_at: "2026-09-01T12:00:01.000Z" });
const otherThread = row({ id: "m3", booking_id: "booking-b", content: "leak" });

assert.deepEqual(appendIncomingChatMessage([], first, "booking-a"), [first]);
assert.deepEqual(appendIncomingChatMessage([first], first, "booking-a"), [first]);
assert.deepEqual(appendIncomingChatMessage([first], second, "booking-a"), [first, second]);
assert.deepEqual(appendIncomingChatMessage([first], otherThread, "booking-a"), [first]);
assert.equal(isChatMessageRow({ id: "x" }), false);
assert.equal(isChatMessageRow(first), true);

const merged = mergeFetchedChatMessages([first], [first, second]);
assert.deepEqual(
  merged.map((m) => m.id),
  ["m1", "m2"]
);

const sql = read("supabase/migrations/20260901140000_realtime_live_chat_messages.sql");
assert.match(sql, /replica identity full/);
assert.match(sql, /alter publication supabase_realtime add table public\.messages/);
assert.doesNotMatch(sql, /drop policy/i);
assert.doesNotMatch(sql, /create policy/i);
assert.doesNotMatch(sql, /service_role/);

const chat = read("components/chat/ChatInterface.tsx");
assert.match(chat, /setMountedChatConversation/);
assert.match(chat, /subscribePostgresChanges/);
assert.match(chat, /event:\s*["']INSERT["']/);
assert.match(chat, /booking_id=eq\.\$\{bookingId\}/);
assert.match(chat, /appendIncomingChatMessage/);
assert.match(chat, /mergeFetchedChatMessages/);
assert.match(chat, /removeRealtimeChannel/);
assert.match(chat, /markBookingMessagesRead/);
assert.match(chat, /text-\[16px\]/);
assert.doesNotMatch(chat, /router\.refresh|location\.reload/);
assert.doesNotMatch(chat, /SUPABASE_SERVICE_ROLE|service_role/);

console.log("chat realtime helpers + ChatInterface contract ok");
