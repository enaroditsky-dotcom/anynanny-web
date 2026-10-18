import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyOperationalEventPopupChange,
  collapsePaymentCompletionCards,
  PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX,
  selectReplayablePaymentCompletionNotifications,
  shouldPersistOperationalCardRead,
  shouldPresentOperationalEventPopup,
  type CoordinationNotification
} from "../lib/notifications/coordination";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function row(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "manual_payment_confirmed",
    title: "קבלת התשלום אושרה",
    body: "הנני אישרה שהתשלום התקבל.",
    payload: { status: "awaiting_sitter_rating" },
    read_at: null,
    ...partial
  };
}

const historical = [
  row({
    id: "hist-1",
    dedupe_key: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-09-01T10:00:00.000Z"
  }),
  row({
    id: "hist-2",
    dedupe_key: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-09-02T10:00:00.000Z"
  }),
  row({
    id: "hist-3",
    dedupe_key: "33333333-3333-4333-8333-333333333333",
    created_at: "2026-09-03T10:00:00.000Z"
  })
];

const olderPaid = row({
  id: "paid-older",
  title: "✅ הבייביסיטר אישרה את קבלת התשלום",
  body: "התשלום עבור המשמרת אושר והמשמרת הושלמה בהצלחה. תודה שבחרתם ב־AnyNanny!",
  payload: { status: "paid", booking_id: "b-older" },
  dedupe_key: `b-older${PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX}`,
  created_at: "2026-10-17T10:00:00.000Z"
});

const newerPaid = row({
  id: "paid-newer",
  title: "✅ הבייביסיטר אישרה את קבלת התשלום",
  body: "התשלום עבור המשמרת אושר והמשמרת הושלמה בהצלחה. תודה שבחרתם ב־AnyNanny!",
  payload: { status: "paid", booking_id: "b-newer" },
  dedupe_key: `b-newer${PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX}`,
  created_at: "2026-10-18T10:00:00.000Z"
});

function replay(rows: ReadonlyArray<Record<string, unknown>>) {
  return selectReplayablePaymentCompletionNotifications(rows);
}

// Migration pending: only historical confirm-time rows exist. Login and refresh show nothing.
assert.deepEqual(
  replay(historical).map((item) => item.id),
  []
);
assert.deepEqual(
  replay(historical).map((item) => item.id),
  []
);

// Migration applied: historical rows stay out, and only the newest completion replays.
const afterMigration = replay([...historical, olderPaid, newerPaid]);
assert.deepEqual(
  afterMigration.map((item) => item.id),
  ["paid-newer"]
);
assert.equal(afterPaidEndsWith(afterMigration[0]), true);
assert.deepEqual(
  replay([...historical, olderPaid, newerPaid]).map((item) => item.id),
  ["paid-newer"]
);

// Refresh after the visible card is marked read reveals the next unread completion.
const afterClose = [...historical, olderPaid, { ...newerPaid, read_at: "2026-10-18T11:00:00.000Z" }];
assert.deepEqual(
  replay(afterClose).map((item) => item.id),
  ["paid-older"]
);
assert.equal(
  replay(historical.map((item) => ({ ...item, read_at: "2026-10-18T11:00:00.000Z" }))).length,
  0
);

// Closing X persists read_at only for the completion id. Historical rows are not marked read.
assert.equal(
  shouldPersistOperationalCardRead({
    markRead: true,
    kind: "manual_payment_confirmed",
    dedupeKey: newerPaid.dedupe_key
  }),
  true
);
assert.equal(
  shouldPersistOperationalCardRead({
    markRead: true,
    kind: "manual_payment_confirmed",
    dedupeKey: historical[0]?.dedupe_key
  }),
  false
);
assert.equal(
  shouldPersistOperationalCardRead({
    markRead: false,
    kind: "manual_payment_confirmed",
    dedupeKey: newerPaid.dedupe_key
  }),
  false
);
assert.equal(shouldPersistOperationalCardRead({ markRead: true, kind: "admin_broadcast" }), true);
assert.equal(
  shouldPersistOperationalCardRead({
    markRead: true,
    kind: "payment_received",
    dedupeKey: `other${PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX}`
  }),
  false
);

// Live inserts: historical confirmations stay hidden. A new completion still appears.
assert.equal(
  applyOperationalEventPopupChange([], { eventType: "INSERT", new: historical[2] }, "/parent/dashboard").length,
  0
);
const live = applyOperationalEventPopupChange([], { eventType: "INSERT", new: newerPaid }, "/parent/dashboard");
assert.deepEqual(
  live.map((item) => item.id),
  ["paid-newer"]
);
assert.equal(
  shouldPresentOperationalEventPopup({
    eventType: "INSERT",
    pathname: "/parent/dashboard",
    kind: "manual_payment_confirmed",
    dedupeKey: historical[0]?.dedupe_key
  }),
  false
);
assert.equal(
  shouldPresentOperationalEventPopup({
    eventType: "INSERT",
    pathname: "/parent/dashboard",
    kind: "manual_payment_confirmed",
    dedupeKey: newerPaid.dedupe_key
  }),
  true
);

// Several completion inserts still leave one card, the newest, and keep other kinds.
const olderMapped = replay([olderPaid])[0] as CoordinationNotification;
const stacked = applyOperationalEventPopupChange(
  [olderMapped],
  { eventType: "INSERT", new: newerPaid },
  "/parent/dashboard"
);
assert.deepEqual(
  stacked.filter((item) => item.kind === "manual_payment_confirmed").map((item) => item.id),
  ["paid-newer"]
);

const admin: CoordinationNotification = {
  id: "admin-1",
  kind: "admin_broadcast",
  title: "הודעת מערכת",
  body: "",
  payload: {},
  created_at: "2026-10-18T09:00:00.000Z",
  read_at: null,
  dedupe_key: null
};
const withAdmin = collapsePaymentCompletionCards([
  admin,
  ...(replay([olderPaid, newerPaid]) as CoordinationNotification[]),
  olderMapped
]);
assert.deepEqual(
  withAdmin.map((item) => item.id),
  ["paid-newer", "admin-1"]
);
assert.equal(
  applyOperationalEventPopupChange([admin], { eventType: "INSERT", new: newerPaid }, "/parent/dashboard").some(
    (item) => item.kind === "admin_broadcast"
  ),
  true
);

const ui = read("components/notifications/global-coordination-notifications.tsx");
assert.match(ui, /dedupeKey: item\.dedupe_key/);
assert.match(ui, /shouldPersistOperationalCardRead/);
assert.match(ui, /markNotificationsReadBestEffort\(supabase, userId, \{ ids: \[id\] \}\)/);
assert.match(ui, /collapsePaymentCompletionCards/);
const dismissStart = ui.indexOf("const scheduleDismiss");
const dismissTimer = ui.slice(dismissStart, ui.indexOf("useEffect", dismissStart));
assert.doesNotMatch(dismissTimer, /markNotificationsRead/);
assert.doesNotMatch(ui, /delete from|notifications\.delete/i);

const coordination = read("lib/notifications/coordination.ts");
const fetchStart = coordination.indexOf("export async function fetchUnreadPaymentCompletionNotifications");
const fetchFn = coordination.slice(fetchStart, coordination.indexOf("export async function fetchUnreadAdminBroadcastNotifications"));
assert.match(fetchFn, /dedupe_key/);
assert.match(fetchFn, /PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX/);
assert.match(fetchFn, /\.limit\(1\)/);
assert.match(fetchFn, /selectReplayablePaymentCompletionNotifications/);

const migration = read("supabase/migrations/20261018074652_parent_payment_completion_notification.sql");
assert.match(migration, /v_booking\.id::text \|\| ':paid'/);
assert.match(migration, /'manual_payment_confirmed'/);
assert.doesNotMatch(migration, /delete from public\.notifications/i);
assert.equal(migration.includes(PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX), true);

const confirmServer = read("lib/billing/sitter-manual-payment-server.ts");
assert.doesNotMatch(confirmServer, /notifyParentManualPaymentConfirmed/);

function afterPaidEndsWith(item: CoordinationNotification | undefined): boolean {
  return String(item?.dedupe_key ?? "").endsWith(PAID_PAYMENT_COMPLETION_DEDUPE_SUFFIX);
}

console.log("payment completion replay ok");
