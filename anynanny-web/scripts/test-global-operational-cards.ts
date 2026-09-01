import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GLOBAL_OPERATIONAL_NOTIFICATION_KINDS,
  OPERATIONAL_CARD_NOTIFICATION_KINDS,
  isGlobalOperationalNotificationKind,
  operationalCardActionLabel
} from "../lib/notifications/coordination";
import {
  parseOperationalCardIdSet,
  serializeOperationalCardIdSet,
  withOperationalCardId,
  withoutOperationalCardId
} from "../lib/notifications/operational-card-session";
import { isOperationalCardsSuppressedRoute } from "../lib/notifications/operational-card-routes";
import {
  MAX_COLLAPSED_OPERATIONAL_CARDS,
  MAX_EXPANDED_OPERATIONAL_CARDS,
  minimizedIdsAfterExpand,
  partitionOperationalCards
} from "../lib/notifications/operational-card-stack";
import { DEFERRED_NOTIFICATION_KINDS, notificationHrefForKind } from "../lib/notifications/kinds";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

assert.deepEqual(
  [...OPERATIONAL_CARD_NOTIFICATION_KINDS],
  [
    "manual_payment_confirmed",
    "manual_payment_denied",
    "manual_payment_resolved_reported",
    "payment_received",
    "shift_end_reminder",
    "missed_shift_clarification"
  ]
);
assert.equal(isGlobalOperationalNotificationKind("payment_required"), false);
assert.equal(isGlobalOperationalNotificationKind("manual_payment_reported"), false);

for (const kind of OPERATIONAL_CARD_NOTIFICATION_KINDS) {
  assert.equal(isGlobalOperationalNotificationKind(kind), true);
}
assert.equal((GLOBAL_OPERATIONAL_NOTIFICATION_KINDS as readonly string[]).includes("chat_message"), false);
assert.equal((GLOBAL_OPERATIONAL_NOTIFICATION_KINDS as readonly string[]).includes("broadcast_alert"), false);
for (const kind of DEFERRED_NOTIFICATION_KINDS) {
  assert.equal(isGlobalOperationalNotificationKind(kind), false);
}

assert.equal(notificationHrefForKind("manual_payment_confirmed", "parent", {}), "/parent/dashboard");
assert.equal(notificationHrefForKind("manual_payment_reported", "sitter", {}), "/sitter/dashboard");
assert.equal(notificationHrefForKind("payment_required", "parent", {}), "/parent/dashboard");
assert.equal(notificationHrefForKind("payment_received", "sitter", {}), "/sitter/wallet");
assert.equal(notificationHrefForKind("missed_shift_clarification", "parent", {}), "/parent/dashboard");
assert.equal(notificationHrefForKind("shift_end_reminder", "sitter", {}), "/sitter/dashboard");
assert.equal(operationalCardActionLabel("booking_approved"), "למשמרת");

assert.equal(isOperationalCardsSuppressedRoute("/parent/dashboard"), true);
assert.equal(isOperationalCardsSuppressedRoute("/sitter/dashboard"), true);
assert.equal(isOperationalCardsSuppressedRoute("/parent/dashboard/"), true);
assert.equal(isOperationalCardsSuppressedRoute("/sitter/dashboard?tab=pay"), true);
assert.equal(isOperationalCardsSuppressedRoute("/parent/profile"), false);
assert.equal(isOperationalCardsSuppressedRoute("/sitter/profile"), false);
assert.equal(isOperationalCardsSuppressedRoute("/parent/calendar"), false);
assert.equal(isOperationalCardsSuppressedRoute("/parent/dashboard/extra"), false);
assert.equal(isOperationalCardsSuppressedRoute("/sitter/shifts"), false);

const items = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `n${n}` }));
const stacked = partitionOperationalCards(items, new Set(), new Set());
assert.equal(MAX_EXPANDED_OPERATIONAL_CARDS, 2);
assert.equal(MAX_COLLAPSED_OPERATIONAL_CARDS, 3);
assert.deepEqual(
  stacked.expanded.map((row) => row.id),
  ["n1", "n2"]
);
assert.deepEqual(
  stacked.collapsed.map((row) => row.id),
  ["n3", "n4", "n5"]
);
assert.equal(stacked.overflowCount, 1);

const hidden = partitionOperationalCards(items, new Set(["n1"]), new Set(["n3"]));
assert.deepEqual(
  hidden.expanded.map((row) => row.id),
  ["n2", "n4"]
);

const afterExpand = minimizedIdsAfterExpand(items, new Set(), new Set(), "n3");
assert.equal(afterExpand.has("n2"), true);
assert.equal(afterExpand.has("n3"), false);
const expandedAfter = partitionOperationalCards(items, new Set(), afterExpand);
assert.deepEqual(
  expandedAfter.expanded.map((row) => row.id),
  ["n1", "n3"]
);

const parsed = parseOperationalCardIdSet(serializeOperationalCardIdSet(withOperationalCardId(new Set(), "abc")));
assert.equal(parsed.has("abc"), true);
assert.equal(withoutOperationalCardId(parsed, "abc").has("abc"), false);
assert.equal(parseOperationalCardIdSet("not-json").size, 0);

const session = read("lib/notifications/operational-card-session.ts");
assert.match(session, /sessionStorage/);
assert.doesNotMatch(session, /localStorage/);
assert.doesNotMatch(session, /read_at|dismissed_at/);

const ui = read("components/notifications/global-coordination-notifications.tsx");
assert.match(ui, /isOperationalCardsSuppressedRoute/);
assert.match(ui, /if \(suppressCards\) return null/);
assert.doesNotMatch(ui, /if \(suppressCards\)[\s\S]{0,80}markNotificationsRead/);
assert.doesNotMatch(ui, /if \(suppressCards\)[\s\S]{0,80}writeOperationalCardHiddenIds/);
assert.match(ui, /hideForSession/);
assert.match(ui, /minimizeForSession/);
assert.match(ui, /openHref/);
assert.match(ui, /markNotificationsReadBestEffort/);
assert.match(ui, /writeOperationalCardHiddenIds/);
assert.match(ui, /writeOperationalCardMinimizedIds/);
const hideFn = ui.slice(ui.indexOf("const hideForSession"), ui.indexOf("const minimizeForSession"));
assert.match(hideFn, /writeOperationalCardHiddenIds/);
assert.doesNotMatch(hideFn, /markNotificationsRead/);
const minimizeFn = ui.slice(ui.indexOf("const minimizeForSession"), ui.indexOf("const expandForSession"));
assert.match(minimizeFn, /writeOperationalCardMinimizedIds/);
assert.doesNotMatch(minimizeFn, /markNotificationsRead/);
assert.match(ui, /עוד \{stack\.overflowCount\} התראות/);
assert.match(ui, /z-\[60\]/);
assert.doesNotMatch(ui, /z-\[9999\]/);
assert.doesNotMatch(ui, /fixed inset-0/);
assert.doesNotMatch(ui, /subscribeToIncomingMessages/);
assert.match(ui, /filter: `user_id=eq\.\$\{userId\}`/);
assert.match(ui, /\[userId, isLoading, reload\]/);
assert.doesNotMatch(ui, /\[userId, isLoading, reload, suppressCards\]/);

const toast = read("components/notifications/global-chat-toast.tsx");
assert.match(toast, /z-\[70\]/);
assert.match(toast, /5\.5rem\+var\(--anynanny-now-dock/);
assert.match(toast, /CHAT_COMPOSER_ACTIVE_EVENT/);
assert.doesNotMatch(toast, /isOperationalCardsSuppressedRoute|\/parent\/dashboard/);

const provider = read("features/chat/incoming-chat-inbox-provider.tsx");
assert.equal(count(provider, "subscribeToIncomingMessages"), 1);

const shell = read("components/app-shell-gate.tsx");
assert.match(shell, /GlobalCoordinationNotifications/);
assert.match(shell, /IncomingChatInboxProvider/);

const broadcastHost = read("app/sitter/layout.tsx");
assert.match(broadcastHost, /SitterBroadcastAlertHost/);

const coordination = read("lib/notifications/coordination.ts");
assert.match(coordination, /GLOBAL_OPERATIONAL_NOTIFICATION_KINDS/);
assert.doesNotMatch(coordination, /confirm_start_required|confirm_end_required|rating_required/);
assert.match(coordination, /"manual_payment_confirmed"/);
assert.doesNotMatch(
  coordination.slice(coordination.indexOf("export const OPERATIONAL_CARD_NOTIFICATION_KINDS"), coordination.indexOf("export const GLOBAL_OPERATIONAL_NOTIFICATION_KINDS")),
  /payment_required|manual_payment_reported/
);

assert.doesNotMatch(ui, /ממתין לדירוג|awaiting_sitter_rating|payment_required|manual_payment_reported/);

console.log("global operational notification cards ok");
