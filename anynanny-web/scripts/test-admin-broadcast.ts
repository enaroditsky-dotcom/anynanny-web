import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROADCAST_AUDIENCE_TYPES,
  countBroadcastAudience,
  profileMatchesBroadcastAudience,
  recipientIdsForBroadcastAudience,
  type BroadcastAudienceProfile
} from "../lib/admin/broadcast-audience";
import { isInternalBroadcastCtaRoute, normalizeBroadcastCtaRoute } from "../lib/admin/broadcast-cta";
import {
  broadcastConfirmMessage,
  broadcastSendButtonLabel,
  validateBroadcastMessage
} from "../lib/admin/broadcast-validation";
import { isValidAdminSessionValue } from "../lib/admin/auth";
import { notificationHrefForKind } from "../lib/notifications/kinds";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260906120000_admin_broadcast_messaging.sql";
const sql = read(MIGRATION);
const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");
const api = read("app/api/admin/broadcast/route.ts");
const page = read("app/admin/broadcast/page.tsx");
const form = read("components/admin/admin-broadcast-form.tsx");
const send = read("lib/admin/broadcast-send.ts");
const kinds = read("lib/notifications/kinds.ts");
const createNotif = read("lib/notifications/create-notification.ts");
const pushDeliver = read("lib/push/deliver-notification.ts");
const canonicalMig = read("supabase/migrations/20260820140000_canonical_notifications.sql");

function fixture(partial: Partial<BroadcastAudienceProfile> & { id: string }): BroadcastAudienceProfile {
  return {
    role: null,
    parent_onboarding_completed_at: null,
    sitter_onboarding_completed_at: null,
    identity_verification_status: "unverified",
    ...partial
  };
}

const users: BroadcastAudienceProfile[] = [
  fixture({
    id: "parent-complete-verified",
    role: "parent",
    parent_onboarding_completed_at: "2026-09-01T00:00:00.000Z",
    identity_verification_status: "verified"
  }),
  fixture({
    id: "parent-incomplete-unverified",
    role: "parent",
    identity_verification_status: "unverified"
  }),
  fixture({
    id: "sitter-complete-verified",
    role: "sitter",
    sitter_onboarding_completed_at: "2026-09-01T00:00:00.000Z",
    identity_verification_status: "verified"
  }),
  fixture({
    id: "sitter-incomplete-pending",
    role: "sitter",
    identity_verification_status: "pending"
  }),
  fixture({
    id: "dual-parent-primary",
    role: "parent",
    parent_onboarding_completed_at: "2026-09-01T00:00:00.000Z",
    sitter_onboarding_completed_at: "2026-09-02T00:00:00.000Z",
    identity_verification_status: "failed"
  }),
  fixture({
    id: "no-role",
    identity_verification_status: null
  })
];

function ids(audience: (typeof BROADCAST_AUDIENCE_TYPES)[number]): string[] {
  return recipientIdsForBroadcastAudience(users, audience).sort();
}

// 1. non-admin cannot access broadcast page/API
assert.match(page, /requireAdminPage/);
assert.match(api, /requireAdminApi/);
assert.doesNotMatch(api, /user_metadata/);
assert.equal(isValidAdminSessionValue("1"), false);
assert.equal(isValidAdminSessionValue(""), false);

// 2-6. recipient counts / group membership
assert.equal(countBroadcastAudience(users, "all_users"), 6);
assert.deepEqual(ids("parents"), ["dual-parent-primary", "parent-complete-verified", "parent-incomplete-unverified"]);
assert.deepEqual(ids("sitters"), ["dual-parent-primary", "sitter-complete-verified", "sitter-incomplete-pending"]);
assert.deepEqual(ids("identity_verified"), ["parent-complete-verified", "sitter-complete-verified"]);
assert.deepEqual(ids("identity_unverified").sort(), [
  "dual-parent-primary",
  "no-role",
  "parent-incomplete-unverified",
  "sitter-incomplete-pending"
]);
assert.deepEqual(ids("profile_complete"), [
  "dual-parent-primary",
  "parent-complete-verified",
  "sitter-complete-verified"
]);
assert.deepEqual(ids("profile_incomplete"), [
  "no-role",
  "parent-incomplete-unverified",
  "sitter-incomplete-pending"
]);

assert.equal(
  profileMatchesBroadcastAudience(
    fixture({
      id: "parent-with-sitter-only-complete",
      role: "parent",
      sitter_onboarding_completed_at: "2026-09-01T00:00:00.000Z"
    }),
    "profile_complete"
  ),
  false
);
assert.equal(
  profileMatchesBroadcastAudience(
    fixture({
      id: "parent-with-sitter-only-complete",
      role: "parent",
      sitter_onboarding_completed_at: "2026-09-01T00:00:00.000Z"
    }),
    "sitters"
  ),
  true
);

assert.match(sql, /p\.role = 'parent' or p\.parent_onboarding_completed_at is not null/);
assert.match(sql, /p\.role = 'sitter'/);
assert.match(sql, /identity_verification_status = 'verified'/);
assert.match(sql, /parent_onboarding_completed_at is not null/);
assert.match(sql, /sp\.onboarding_completed_at is not null/);

// 7. test-send only reaches the admin/signed-in user
assert.match(api, /action === "test"/);
assert.match(api, /sendBroadcastTestToUser/);
assert.match(send, /createInAppNotification/);
assert.match(send, /kind: "admin_broadcast"/);
assert.match(send, /test:\$\{/);
assert.match(api, /signedInUserId/);
assert.match(send, /createInAppNotification/);

// 8. final send reaches only selected audience via server-side resolve
assert.match(api, /sendAdminBroadcast/);
assert.match(send, /ADMIN_SEND_IN_APP_BROADCAST_RPC/);
assert.match(sql, /from public\.admin_broadcast_recipient_ids\(p_audience\)/);
assert.doesNotMatch(form, /user_ids|recipient_ids|p_user_ids/);
assert.doesNotMatch(api, /body\.user_ids|body\.recipients/);

// 9. duplicate-submit protection
assert.match(sql, /create unique index if not exists admin_broadcasts_idempotency_key_uidx/);
assert.match(sql, /already_sent', true/);
assert.match(form, /idempotency_key/);
assert.match(form, /sendingLockRef/);
assert.match(api, /Missing idempotency key/);

// 10. title/body validation
const missing = validateBroadcastMessage({ audience: "all_users", title: "  ", body: "hello" });
assert.equal(missing.ok, false);
const html = validateBroadcastMessage({
  audience: "all_users",
  title: "<script>x</script>",
  body: "hello"
});
assert.equal(html.ok, false);
const longTitle = validateBroadcastMessage({
  audience: "all_users",
  title: "x".repeat(81),
  body: "hello"
});
assert.equal(longTitle.ok, false);
const okMsg = validateBroadcastMessage({
  audience: "all_users",
  title: "עדכון",
  body: "שלום לכל המשתמשים"
});
assert.equal(okMsg.ok, true);

// 11. internal CTA validation
assert.equal(isInternalBroadcastCtaRoute("/parent/profile"), true);
assert.equal(isInternalBroadcastCtaRoute("/sitter/profile"), true);
assert.equal(isInternalBroadcastCtaRoute("/settings"), true);
assert.equal(isInternalBroadcastCtaRoute("https://example.com"), false);
assert.equal(isInternalBroadcastCtaRoute("javascript:alert(1)"), false);
assert.equal(isInternalBroadcastCtaRoute("/admin/reports"), false);
assert.equal(isInternalBroadcastCtaRoute("/api/admin/broadcast"), false);
assert.equal(isInternalBroadcastCtaRoute("//evil.example"), false);
assert.equal(isInternalBroadcastCtaRoute("/parent/../admin"), false);
assert.equal(normalizeBroadcastCtaRoute("/parent/profile"), "/parent/profile");
const badCta = validateBroadcastMessage({
  audience: "parents",
  title: "כותרת",
  body: "גוף",
  ctaLabel: "לפרופיל",
  ctaRoute: "https://evil.example"
});
assert.equal(badCta.ok, false);
const oneSidedCta = validateBroadcastMessage({
  audience: "parents",
  title: "כותרת",
  body: "גוף",
  ctaLabel: "לפרופיל"
});
assert.equal(oneSidedCta.ok, false);
assert.equal(
  notificationHrefForKind("admin_broadcast", "parent", { cta_route: "/parent/settings" }),
  "/parent/settings"
);

// 12. audit log creation
assert.match(sql, /create table if not exists public.admin_broadcasts/);
assert.match(sql, /admin_actor text not null default 'admin_dashboard'/);
assert.match(sql, /'admin_dashboard'/);
assert.doesNotMatch(sql, /admin_user_id/);
assert.doesNotMatch(sql, /p_admin_user_id/);
assert.doesNotMatch(send, /p_admin_user_id|adminUserId/);
assert.doesNotMatch(api, /sendAdminBroadcast\(parsed\.value,\s*adminUserId\)/);
assert.match(sql, /audience_type text not null/);
assert.match(sql, /recipient_count integer not null/);
assert.match(sql, /cta_label text/);
assert.match(sql, /cta_route text/);
assert.match(sql, /insert into public.admin_broadcasts/);
assert.doesNotMatch(sqlWithoutComments, /service_role_key|access_token|refresh_token/);
assert.doesNotMatch(sql, /recipient_emails|phone_number|identity_id_number/);
assert.match(sql, /revoke all on table public.admin_broadcasts from anon/);
assert.match(sql, /revoke all on table public.admin_broadcasts from authenticated/);
assert.doesNotMatch(sqlWithoutComments, /create policy \w+ on public.admin_broadcasts/);
assert.match(sql, /grant execute on function public.admin_send_in_app_broadcast/);
assert.match(sql, /from authenticated/);
assert.match(sql, /grant execute on function public.admin_count_broadcast_recipients\(text\) to service_role/);
assert.doesNotMatch(sqlWithoutComments, /grant execute on function public.admin_send_in_app_broadcast[\s\S]{0,80}to authenticated/);
assert.doesNotMatch(sqlWithoutComments, /grant execute on function public.admin_count_broadcast_recipients[\s\S]{0,80}to authenticated/);
assert.doesNotMatch(sqlWithoutComments, /grant execute on function public.admin_broadcast_recipient_ids[\s\S]{0,80}to authenticated/);

// 13. existing normal messaging behavior remains unchanged
assert.match(canonicalMig, /create trigger messages_notify_recipient/);
assert.match(canonicalMig, /kind,\s*title,\s*body,\s*payload[\s\S]*'booking_request'/);
assert.match(createNotif, /notifySitterManualPaymentReported/);
assert.doesNotMatch(createNotif, /admin_broadcast/);
assert.match(pushDeliver, /kind === "admin_broadcast"/);
assert.match(pushDeliver, /in-app only/);
assert.doesNotMatch(send, /deliverCanonicalNotificationPush|\/api\/push\/deliver|FCM|twilio|nodemailer/);
assert.doesNotMatch(api, /NEXT_PUBLIC_SUPABASE_SERVICE|service_role/);
assert.match(send, /getSupabaseServiceRoleClient/);
assert.match(form, /תצוגה מקדימה/);
assert.match(form, /שליחת הודעת בדיקה לעצמי/);
assert.match(form, /broadcastSendButtonLabel/);
assert.match(form, /broadcastConfirmMessage/);
assert.equal(broadcastSendButtonLabel(38), "שליחה ל-38 משתמשים");
assert.match(broadcastConfirmMessage(38), /38 משתמשים/);
assert.match(page, /שליחת הודעת Broadcast/);
assert.match(kinds, /"admin_broadcast"/);
assert.match(read("components/admin/admin-top-bar.tsx"), /\/admin\/broadcast/);
assert.match(read("lib/notifications/coordination.ts"), /admin_broadcast/);
assert.doesNotMatch(sqlWithoutComments, /create policy \w+ on public.notifications/);
assert.doesNotMatch(sqlWithoutComments, /grant insert on table public.notifications/);
assert.doesNotMatch(sqlWithoutComments, /grant all on table public.notifications/);

console.log("admin broadcast messaging checks passed.");
