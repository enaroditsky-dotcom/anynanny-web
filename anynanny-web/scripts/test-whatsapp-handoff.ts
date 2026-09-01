import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isParentBookingTrackingStatus,
  isSitterShiftCircleStatus,
  isWhatsAppHandoffStatus
} from "../lib/bookings/booking-realtime-handler";
import type { BookingStatus } from "../lib/bookings/constants";
import { CHAT_GRACE_PERIOD_MS, getChatLifecycle } from "../lib/chat/chat-lifecycle";
import {
  WHATSAPP_HANDOFF_HINT,
  WHATSAPP_HANDOFF_LABEL,
  WHATSAPP_HANDOFF_PREFILL,
  buildWhatsAppHandoffUrl,
  isWhatsAppHandoffStatus as isWhatsAppFromModule,
  resolveWhatsAppHandoffStatus,
  toWhatsAppWaMeDigits
} from "../lib/chat/whatsapp-handoff";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-09-01T12:00:00.000Z");

const ALL_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "sitter_started",
  "parent_started",
  "sitter_ended",
  "completed",
  "awaiting_missed_shift_reason",
  "did_not_occur",
  "happened_unverified",
  "missed_shift_disputed"
];

const ELIGIBLE: BookingStatus[] = ["approved", "sitter_started", "parent_started", "sitter_ended"];

for (const status of ALL_STATUSES) {
  const expected = ELIGIBLE.includes(status);
  assert.equal(isWhatsAppHandoffStatus(status), expected, status);
  assert.equal(isWhatsAppHandoffStatus(status), isParentBookingTrackingStatus(status), status);
  assert.equal(isWhatsAppHandoffStatus(status), isSitterShiftCircleStatus(status), status);
  assert.equal(isWhatsAppFromModule(status), expected, status);
}

assert.equal(isWhatsAppHandoffStatus("confirmed"), true);
assert.equal(isWhatsAppHandoffStatus("active"), true);
assert.equal(isWhatsAppHandoffStatus("requested"), false);
assert.equal(isWhatsAppHandoffStatus("pending"), false);
assert.equal(isWhatsAppHandoffStatus("completed"), false);

const completedWithinGrace = getChatLifecycle(
  { status: "completed", actualEndTime: new Date(now - 2 * HOUR).toISOString() },
  now
);
assert.equal(completedWithinGrace.writable, true);
assert.equal(isWhatsAppHandoffStatus("completed"), false);

const completedAfterGrace = getChatLifecycle(
  { status: "completed", actualEndTime: new Date(now - CHAT_GRACE_PERIOD_MS - 1).toISOString() },
  now
);
assert.equal(completedAfterGrace.writable, false);
assert.equal(isWhatsAppHandoffStatus("completed"), false);

assert.equal(isWhatsAppHandoffStatus("pending"), false);
assert.equal(getChatLifecycle({ status: "pending" }, now).writable, true);

assert.equal(resolveWhatsAppHandoffStatus("approved", "completed"), "completed");
assert.equal(resolveWhatsAppHandoffStatus("parent_started", "sitter_ended"), "parent_started");
assert.equal(resolveWhatsAppHandoffStatus(null, "approved"), "approved");
assert.equal(resolveWhatsAppHandoffStatus(undefined, null), null);

assert.equal(toWhatsAppWaMeDigits("0501234567"), "972501234567");
assert.equal(toWhatsAppWaMeDigits("050-123-4567"), "972501234567");
assert.equal(toWhatsAppWaMeDigits("+972501234567"), "972501234567");
assert.equal(toWhatsAppWaMeDigits("972501234567"), "972501234567");
assert.equal(toWhatsAppWaMeDigits("9720501234567"), "972501234567");
assert.equal(toWhatsAppWaMeDigits("501234567"), "972501234567");
assert.equal(toWhatsAppWaMeDigits("+1-555-0100"), null);
assert.equal(toWhatsAppWaMeDigits(""), null);

const url = buildWhatsAppHandoffUrl("0501234567");
assert.ok(url);
assert.match(url, /^https:\/\/wa\.me\/972501234567\?text=/);
assert.ok(url.includes(encodeURIComponent(WHATSAPP_HANDOFF_PREFILL)));
assert.equal(buildWhatsAppHandoffUrl("not-a-phone"), null);

const lifecycleSrc = read("lib/chat/chat-lifecycle.ts");
assert.match(lifecycleSrc, /CHAT_GRACE_PERIOD_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(lifecycleSrc, /"pending"/);

const chat = read("components/chat/ChatInterface.tsx");
assert.match(chat, /WhatsAppHandoffAction/);
assert.match(chat, /resolveWhatsAppHandoffStatus/);
assert.match(chat, /event:\s*['"]UPDATE['"]/);
assert.match(chat, /id=eq\.\$\{bookingId\}/);
assert.match(chat, /BOOKINGS_TABLE/);
assert.match(chat, /event:\s*['"]INSERT['"]/);
assert.doesNotMatch(chat, /CHAT_GRACE_PERIOD/);
assert.doesNotMatch(chat, /CHAT_ACTIVE_WRITABLE/);
assert.doesNotMatch(chat, /SUPABASE_SERVICE_ROLE|getSupabaseServiceRoleClient/);
assert.doesNotMatch(chat, /\/api\/chat\/initiate/);
assert.doesNotMatch(chat, /lifecycle\?\.writable.*WhatsApp|WhatsApp.*lifecycle\?\.writable/);

const action = read("components/chat/whatsapp-handoff-action.tsx");
assert.match(action, /מעבר ל-WhatsApp/);
assert.match(action, /לשיחה, תמונות, וידאו והודעות קוליות/);
assert.match(action, /\/api\/chat\/whatsapp/);
assert.match(action, /isWhatsAppHandoffStatus/);
assert.match(action, /wa\.me|openWhatsAppHandoffUrl/);
assert.doesNotMatch(action, /sitterPhone|payout_bit_phone|referee_phone/);
assert.equal(WHATSAPP_HANDOFF_LABEL, "מעבר ל-WhatsApp");
assert.equal(WHATSAPP_HANDOFF_HINT, "לשיחה, תמונות, וידאו והודעות קוליות");

const route = read("app/api/chat/whatsapp/route.ts");
assert.match(route, /auth\.getUser\(\)/);
assert.match(route, /loadAuthorizedWhatsAppHandoffUrl/);
assert.match(route, /user\.id/);
assert.doesNotMatch(route, /sitterPhone/);
assert.doesNotMatch(route, /phone:\s/);

const server = read("lib/chat/whatsapp-handoff-server.ts");
assert.match(server, /server-only/);
assert.match(server, /auth\.getUser|actorId/);
assert.match(server, /parent_id/);
assert.match(server, /sitter_id/);
assert.match(server, /isWhatsAppHandoffStatus/);
assert.match(server, /getSupabaseServiceRoleClient/);
assert.match(server, /select\("phone"\)/);
assert.match(server, /auth\.admin\.getUserById/);
assert.match(server, /buildWhatsAppHandoffUrl/);
assert.doesNotMatch(server, /payout_bit_phone|payout_paybox_phone|referee_phone/);
assert.doesNotMatch(server, /CHAT_GRACE_PERIOD|CHAT_ACTIVE_WRITABLE/);

const helpers = read("lib/chat/whatsapp-handoff.ts");
assert.match(helpers, /isWhatsAppHandoffStatus/);
assert.match(helpers, /booking-realtime-handler/);
assert.doesNotMatch(helpers, /CHAT_GRACE_PERIOD|CHAT_ACTIVE_WRITABLE/);

const statusHelpers = read("lib/bookings/booking-realtime-handler.ts");
assert.match(statusHelpers, /export function isWhatsAppHandoffStatus/);
assert.match(statusHelpers, /return isParentBookingTrackingStatus\(status as BookingStatusInput\)/);
assert.match(statusHelpers, /booking-status-normalize/);
assert.doesNotMatch(statusHelpers, /use-shift-activation-status/);

const parentChat = read("components/chat/parent-chat-room.tsx");
assert.match(parentChat, /ChatInterface/);

const parentPage = read("app/parent/chat/[bookingId]/page.tsx");
const sitterPage = read("app/sitter/chat/[bookingId]/page.tsx");
assert.match(parentPage, /BookingChat/);
assert.match(sitterPage, /BookingChat/);

const linked = read("components/bookings/parent-linked-shift-card.tsx");
assert.match(linked, /bookingStatus=\{booking\.status\}/);

const publicSurfaces = [
  "lib/sitter/fetch-parent-sitter-profile.ts",
  "lib/sitter/parent-sitter-search.ts",
  "lib/sitter/public-search-card.ts",
  "components/sitter/public-sitter-search-card.tsx",
  "app/parent/search/page.tsx",
  "app/parent/search/results/page.tsx",
  "app/parent/sitter/[sitterId]/page.tsx"
];
for (const file of publicSurfaces) {
  const src = read(file);
  assert.doesNotMatch(src, /whatsapp-handoff/);
  assert.doesNotMatch(src, /\/api\/chat\/whatsapp/);
}

const billingTouched = [
  "lib/billing/parent-manual-payment-server.ts",
  "lib/billing/manual-payment-ui.ts",
  "lib/bookings/payment-status-label.ts"
];
for (const file of billingTouched) {
  const src = read(file);
  assert.doesNotMatch(src, /whatsapp-handoff|מעבר ל-WhatsApp/);
}

assert.doesNotMatch(lifecycleSrc, /whatsapp-handoff|מעבר ל-WhatsApp/);

console.log("whatsapp handoff contract ok");
