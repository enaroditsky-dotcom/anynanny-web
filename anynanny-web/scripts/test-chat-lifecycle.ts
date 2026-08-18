import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAT_GRACE_PERIOD_MS,
  getChatLifecycle,
  resolveCompletedShiftEndMs
} from "../lib/chat/chat-lifecycle";

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-08-18T20:00:00.000Z");

function isoFrom(ms: number): string {
  return new Date(ms).toISOString();
}

const upcoming = getChatLifecycle({ status: "approved", scheduledEndTime: isoFrom(now + 48 * HOUR) }, now);
assert.equal(upcoming.writable, true);
assert.equal(upcoming.section, "active");
assert.equal(upcoming.label, null);

const active = getChatLifecycle({ status: "parent_started" }, now);
assert.equal(active.writable, true);
assert.equal(active.section, "active");

const sitterEnded = getChatLifecycle({ status: "sitter_ended" }, now);
assert.equal(sitterEnded.writable, true);

const completedJustEnded = getChatLifecycle(
  { status: "completed", scheduledEndTime: isoFrom(now) },
  now
);
assert.equal(completedJustEnded.writable, true);
assert.equal(completedJustEnded.section, "active");
assert.equal(completedJustEnded.label, "משמרת הסתיימה");

const completedAt23h = getChatLifecycle(
  { status: "completed", scheduledEndTime: isoFrom(now - 23 * HOUR) },
  now
);
assert.equal(completedAt23h.writable, true);
assert.equal(completedAt23h.section, "active");

const completedAfter24h = getChatLifecycle(
  { status: "completed", scheduledEndTime: isoFrom(now - CHAT_GRACE_PERIOD_MS - 1) },
  now
);
assert.equal(completedAfter24h.writable, false);
assert.equal(completedAfter24h.section, "past");
assert.equal(completedAfter24h.label, "משמרת הסתיימה · השיחה סגורה");
assert.equal(completedAfter24h.closedHeadline, "השיחה נסגרה – המשמרת הסתיימה.");

const cancelledJustApproved = getChatLifecycle(
  { status: "cancelled", cancelledAt: isoFrom(now) },
  now
);
assert.equal(cancelledJustApproved.writable, true);
assert.equal(cancelledJustApproved.section, "active");
assert.equal(cancelledJustApproved.label, "משמרת בוטלה");

const cancelledAt23h = getChatLifecycle(
  { status: "cancelled", cancelledAt: isoFrom(now - 23 * HOUR) },
  now
);
assert.equal(cancelledAt23h.writable, true);

const cancelledAfter24h = getChatLifecycle(
  { status: "cancelled", cancelledAt: isoFrom(now - CHAT_GRACE_PERIOD_MS - 1) },
  now
);
assert.equal(cancelledAfter24h.writable, false);
assert.equal(cancelledAfter24h.section, "past");
assert.equal(cancelledAfter24h.label, "משמרת בוטלה · השיחה סגורה");
assert.equal(cancelledAfter24h.closedHeadline, "השיחה נסגרה – המשמרת בוטלה.");

const cancelledWithoutTimestamp = getChatLifecycle({ status: "cancelled" }, now);
assert.equal(cancelledWithoutTimestamp.writable, false);

assert.equal(
  resolveCompletedShiftEndMs({
    actualEndTime: "2026-08-18T21:00:00.000Z",
    sessionEndTime: "2026-08-18T22:00:00.000Z",
    scheduledEndTime: "2026-08-18T23:00:00.000Z"
  }),
  Date.parse("2026-08-18T21:00:00.000Z")
);

assert.equal(
  resolveCompletedShiftEndMs({
    sessionEndTime: "2026-08-18T22:00:00.000Z",
    scheduledEndTime: "2026-08-18T23:00:00.000Z"
  }),
  Date.parse("2026-08-18T22:00:00.000Z")
);

const completedPrefersActual = getChatLifecycle(
  {
    status: "completed",
    actualEndTime: isoFrom(now - 2 * HOUR),
    scheduledEndTime: isoFrom(now - 30 * HOUR)
  },
  now
);
assert.equal(completedPrefersActual.writable, true);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const atomic = readFileSync(resolve(root, "sql/end_shift_atomic_set_actual_end_time.sql"), "utf8");
assert.match(atomic, /actual_end_time = coalesce\(actual_end_time, p_end_iso\)/);
assert.match(atomic, /end_time\s+= p_end_iso/);
assert.match(atomic, /PROPOSAL ONLY/);

const rls = readFileSync(resolve(root, "sql/chat_messages_insert_lifecycle.sql"), "utf8");
assert.match(rls, /coalesce\(b\.actual_end_time, b\.end_time\) \+ interval '24 hours'/);
assert.match(rls, /PROPOSAL ONLY/);

const confirm = readFileSync(resolve(root, "lib/bookings/parent-confirm-end-booking.ts"), "utf8");
assert.match(confirm, /actual_end_time: actualEndIso/);
assert.match(confirm, /p_end_iso:/);

console.log("chat lifecycle ok");
