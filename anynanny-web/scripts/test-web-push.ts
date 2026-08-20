import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeAppBadgeCount } from "../lib/push/badge";
import {
  detectPushCapability,
  pushSettingsStatusCopy,
  resolveEffectivePush
} from "../lib/push/capability";
import { sendPushToSubscriptions } from "../lib/push/deliver-notification";
import { PUSH_NOTIFICATION_KIND_LIST } from "../lib/push/kind-list";
import { buildPrivacySafePushPayload, privacySafeBodyForKind, pushHrefForKind } from "../lib/push/payload";
import { vapidPublicKeyToUint8Array } from "../lib/push/vapid-public";
import {
  authorizePushWebhook,
  extractNotificationIdFromWebhookBody,
  PUSH_WEBHOOK_HEADER
} from "../lib/push/webhook-auth";
import { isExpiredPushStatus } from "../lib/push/web-push-sender";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../lib/settings/notification-preferences";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const sql = read("supabase/migrations/20260820180000_push_subscriptions.sql");
const sw = read("public/sw.js");
const registerPush = read("lib/push/register-push.ts");
const runtime = read("components/push/push-runtime.tsx");
const banner = read("components/push/push-permission-banner.tsx");
const settings = read("components/settings/notification-settings-section.tsx");
const logout = read("lib/auth/logout.ts");
const deliverRoute = read("app/api/push/deliver/route.ts");
const deliver = read("lib/push/deliver-notification.ts");
const layout = read("app/layout.tsx");
const parentDash = read("app/parent/dashboard/page.tsx");
const sitterDash = read("app/sitter/dashboard/page.tsx");
const parentDashClient = read("components/parent/parent-dashboard-client.tsx");
const swRegister = read("lib/push/service-worker-register.ts");
const layoutSw = read("components/push/service-worker-register.tsx");
const sender = read("lib/push/web-push-sender.ts");
const bottomNav = read("components/bottom-nav.tsx");

function headers(map: Record<string, string>) {
  return {
    get(name: string) {
      return map[name.toLowerCase()] ?? map[name] ?? null;
    }
  };
}

// 1. Push preference defaults true per new user
assert.equal(DEFAULT_NOTIFICATION_PREFERENCES.pushEnabled, true);
assert.equal(DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled, true);
assert.match(sql, /add column if not exists push_enabled boolean not null default true/);
assert.match(sql, /add column if not exists sound_enabled boolean not null default true/);

// 2. OS denied → UI does not falsely show active
const denied = resolveEffectivePush({
  pushEnabled: true,
  permission: "denied",
  hasSubscription: false,
  capable: true
});
assert.equal(denied.active, false);
assert.match(pushSettingsStatusCopy(denied, false) ?? "", /חסומות בהגדרות המכשיר/);
assert.match(settings, /effective\.active/);
assert.doesNotMatch(settings, /checked=\{effective\.active\}/);

// 3. Permission granted → subscription saved for correct user
assert.match(registerPush, /upsert_push_subscription|UPSERT_PUSH_SUBSCRIPTION_RPC/);
assert.match(sql, /v_uid uuid := auth\.uid\(\)/);
assert.match(sql, /user_id = v_uid/);
assert.doesNotMatch(registerPush, /p_user_id/);

// 4. Another user cannot read/update/delete subscription
assert.match(sql, /using \(user_id = auth\.uid\(\)\)/);
assert.match(sql, /with check \(user_id = auth\.uid\(\)\)/);
assert.match(sql, /for delete[\s\S]*using \(user_id = auth\.uid\(\)\)/);
assert.match(sql, /revoke all on table public\.push_subscriptions from anon/);
assert.doesNotMatch(sql, /grant[\s\S]*push_subscriptions to public/);

// 5. Logout unsubscribes/removes current account endpoint
assert.match(logout, /unsubscribeCurrentPushSubscription/);
const logoutUnsubIdx = logout.indexOf("unsubscribeCurrentPushSubscription");
const logoutSignOutIdx = logout.indexOf("signOut");
assert.ok(logoutUnsubIdx >= 0 && logoutUnsubIdx < logoutSignOutIdx);

// 6. push_enabled=false → sender skips
assert.match(deliver, /push_enabled === false/);
assert.match(deliver, /reason: "push_enabled=false"/);

// 7. canonical booking_request → correct push payload
const bookingPush = buildPrivacySafePushPayload({
  notificationId: "n1",
  kind: "booking_request",
  role: "sitter",
  payload: { booking_id: "b1" }
});
assert.equal(bookingPush.title, "AnyNanny");
assert.equal(bookingPush.body, "יש לך בקשת משמרת חדשה");
assert.equal(bookingPush.url, "/sitter/dashboard");
assert.doesNotMatch(JSON.stringify(bookingPush), /should-not-appear|address/);

// 8. chat_message → safe content + correct deep link
const chatPush = buildPrivacySafePushPayload({
  notificationId: "n2",
  kind: "chat_message",
  role: "parent",
  payload: { booking_id: "b9", message_id: "m1" }
});
assert.equal(chatPush.body, "התקבלה הודעה חדשה ב-AnyNanny");
assert.equal(chatPush.url, "/parent/chat/b9");
assert.doesNotMatch(chatPush.body, /m1|hello|content/);

// 9. broadcast_alert → correct sitter deep link
assert.equal(pushHrefForKind("broadcast_alert", "sitter", {}), "/sitter/dashboard");
assert.equal(privacySafeBodyForKind("broadcast_alert"), "AnyNanny Now חדש באזור שלך");

// 10–11. expired 410 removed; one bad endpoint does not block another
void (async () => {
const subs = [
  { id: "s1", endpoint: "https://expired.example/1", p256dh: "a", auth: "b" },
  { id: "s2", endpoint: "https://ok.example/2", p256dh: "a", auth: "b" }
];
const removed: string[] = [];
const sentTo: string[] = [];
const fanout = await sendPushToSubscriptions(
  subs,
  "{}",
  async (sub) => {
    if (sub.id === "s1") return { ok: false, expired: true, status: 410 };
    sentTo.push(sub.id);
    return { ok: true };
  },
  async (sub) => {
    removed.push(sub.id);
  }
);
assert.equal(fanout.sent, 1);
assert.equal(fanout.removed, 1);
assert.deepEqual(sentTo, ["s2"]);
assert.deepEqual(removed, ["s1"]);
assert.equal(isExpiredPushStatus(410), true);
assert.equal(isExpiredPushStatus(404), true);
assert.equal(isExpiredPushStatus(500), false);

// 12. native prompt never runs automatically on load
for (const [name, source] of [
  ["layout", layout],
  ["runtime", runtime],
  ["sw-register", swRegister],
  ["layout-sw", layoutSw],
  ["parent-dashboard", parentDash],
  ["sitter-dashboard", sitterDash],
  ["parent-dashboard-client", parentDashClient]
] as const) {
  assert.doesNotMatch(source, /Notification\.requestPermission/, `${name} must not request permission`);
}
assert.match(registerPush, /enablePushFromUserGesture[\s\S]*Notification\.requestPermission/);
assert.match(registerPush, /Call only from a user gesture/);
assert.doesNotMatch(runtime, /enablePushFromUserGesture/);
assert.match(banner, /enablePushFromUserGesture/);
assert.match(settings, /enablePushFromUserGesture/);

// 13. iOS non-standalone → install instructions, no permission request
const iosTab = detectPushCapability({
  hasWindow: true,
  hasServiceWorker: true,
  hasNotifications: true,
  hasPushManager: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  maxTouchPoints: 5,
  platform: "iPhone",
  displayModeStandalone: false,
  navigatorStandalone: false
});
assert.equal(iosTab.ios, true);
assert.equal(iosTab.iosRequiresStandalone, true);
assert.equal(iosTab.canSubscribe, false);
assert.match(registerPush, /ios-not-standalone/);
assert.match(banner, /הוסיפו את AnyNanny למסך הבית/);
assert.match(settings, /iosRequiresStandalone/);
assert.doesNotMatch(banner, /iosInstall \? \([\s\S]*enablePushFromUserGesture/);

// 14. iOS standalone → enable flow allowed
const iosPwa = detectPushCapability({
  hasWindow: true,
  hasServiceWorker: true,
  hasNotifications: true,
  hasPushManager: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  maxTouchPoints: 5,
  platform: "iPhone",
  displayModeStandalone: true,
  navigatorStandalone: true
});
assert.equal(iosPwa.canSubscribe, true);
assert.equal(iosPwa.iosRequiresStandalone, false);
assert.match(layout, /capable:\s*true/);

// 15. badge formula avoids double-counting chat
assert.equal(
  computeAppBadgeCount({ unreadNonChatNotifications: 2, distinctUnreadIncomingChatBookings: 3 }),
  5
);
assert.match(read("lib/push/badge-query.ts"), /neq\("kind", "chat_message"\)/);
assert.match(read("lib/push/badge-query.ts"), /booking_id/);

// 16. zero count clears badge
assert.equal(computeAppBadgeCount({ unreadNonChatNotifications: 0, distinctUnreadIncomingChatBookings: 0 }), 0);
assert.match(read("lib/push/badge.ts"), /count <= 0/);
assert.match(read("lib/push/badge.ts"), /clearAppBadge/);
assert.match(sw, /clearAppBadge/);

// 17. notification click opens/focuses correct URL
assert.match(sw, /notificationclick/);
assert.match(sw, /client\.focus/);
assert.match(sw, /client\.navigate/);
assert.match(sw, /clients\.openWindow/);
assert.match(sw, /ANYNANNY_PUSH_NAVIGATE/);
assert.match(runtime, /ANYNANNY_PUSH_NAVIGATE/);

// 18. arbitrary browser request cannot send push to another user
assert.match(deliverRoute, /authorizePushWebhook/);
assert.doesNotMatch(deliverRoute, /getUser\(|getSession\(/);
assert.match(deliver, /from\(NOTIFICATIONS_TABLE\)/);
assert.match(deliver, /notification\.user_id/);
assert.doesNotMatch(deliverRoute, /body\.user_id|record\.user_id/);

const prevSecret = process.env.PUSH_WEBHOOK_SECRET;
process.env.PUSH_WEBHOOK_SECRET = "unit-test-secret";
assert.equal(authorizePushWebhook({ headers: headers({}) }).ok, false);
assert.equal(
  authorizePushWebhook({ headers: headers({ authorization: "Bearer wrong" }) }).ok,
  false
);
assert.equal(
  authorizePushWebhook({
    headers: headers({ authorization: "Bearer unit-test-secret" })
  }).ok,
  true
);
assert.equal(
  authorizePushWebhook({
    headers: headers({ [PUSH_WEBHOOK_HEADER]: "unit-test-secret" })
  }).ok,
  true
);
if (prevSecret === undefined) delete process.env.PUSH_WEBHOOK_SECRET;
else process.env.PUSH_WEBHOOK_SECRET = prevSecret;

assert.equal(
  extractNotificationIdFromWebhookBody({
    type: "INSERT",
    table: "notifications",
    record: { id: "abc" }
  }),
  "abc"
);
assert.equal(
  extractNotificationIdFromWebhookBody({
    type: "INSERT",
    table: "bookings",
    record: { id: "abc" }
  }),
  null
);

// Schema / SW / VAPID / settings extras
assert.match(sql, /create table if not exists public\.push_subscriptions/);
assert.match(sql, /create unique index if not exists push_subscriptions_endpoint_uidx/);
assert.match(sql, /create table if not exists public\.notification_push_dispatches/);
assert.match(sql, /revoke all on table public\.notification_push_dispatches from authenticated/);
assert.match(sw, /addEventListener\("push"/);
assert.match(sw, /showNotification/);
assert.match(sw, /DEFAULT_TITLE = "AnyNanny"/);
assert.doesNotMatch(sw, /caches\.open|cache\.addAll/);
assert.match(sender, /process\.env\.VAPID_PRIVATE_KEY/);
assert.doesNotMatch(sender, /console\.(log|info|warn|error).*VAPID_PRIVATE_KEY/);
assert.doesNotMatch(registerPush, /VAPID_PRIVATE_KEY/);
assert.match(read("lib/push/vapid-public.ts"), /NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
assert.match(settings, /אילו התראות אקבל\?/);
assert.equal(PUSH_NOTIFICATION_KIND_LIST.length, 9);
assert.match(settings, /לא שולט בצליל התראת המערכת/);
assert.match(bottomNav, /hasUnreadMessages/);
assert.match(swRegister, /navigator\.serviceWorker/);
assert.match(layoutSw, /registerAnyNannyServiceWorker/);

const bytes = vapidPublicKeyToUint8Array("AQID");
assert.equal(bytes.length, 3);
assert.equal(bytes[0], 1);

const android = detectPushCapability({
  hasWindow: true,
  hasServiceWorker: true,
  hasNotifications: true,
  hasPushManager: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120",
  maxTouchPoints: 5,
  platform: "Linux armv8l",
  displayModeStandalone: false,
  navigatorStandalone: false
});
assert.equal(android.canSubscribe, true);

console.log("web push PUSH-2 checks passed.");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
