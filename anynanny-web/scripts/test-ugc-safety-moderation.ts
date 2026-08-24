import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAdminSessionValue,
  isValidAdminSessionValue
} from "../lib/admin/auth";
import {
  REPORT_CONFIRMATION_MESSAGE,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  SELF_REPORT_MESSAGE
} from "../lib/safety/constants";
import { isSafetyUuid } from "../lib/safety/constants";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260823160000_ugc_safety_moderation.sql";
const sql = read(MIGRATION);
const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");

const laterMigrations = readdirSync(resolve(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql") && name > "20260823160000_ugc_safety_moderation.sql");
assert.equal(laterMigrations.length, 0, "UGC safety must be the latest migration");

assert.match(sql, /add column if not exists suspended_at timestamptz/);
assert.match(sql, /add column if not exists suspended_reason text/);
assert.match(sql, /revoke update \(suspended_at, suspended_reason\) on table public\.profiles from authenticated/);
assert.match(sql, /create or replace function public\.profiles_protect_suspension_columns\(\)/);
assert.match(sql, /if auth\.role\(\) is distinct from 'service_role' then/);
assert.match(sql, /new\.suspended_at := old\.suspended_at/);

assert.match(sql, /create table if not exists public\.user_reports/);
assert.match(sql, /constraint user_reports_not_self check \(reporter_id <> reported_user_id\)/);
assert.match(sql, /reason in \('abuse', 'threats', 'illegal', 'spam_fraud', 'inappropriate', 'other'\)/);
assert.match(sql, /target_type in \('user', 'profile', 'message', 'review', 'photo'\)/);
assert.match(sql, /char_length\(details\) <= 2000/);
assert.match(sql, /create unique index if not exists user_reports_open_dedupe_idx/);
assert.match(sql, /where status = 'open'/);
assert.match(sql, /create policy user_reports_insert_own/);
assert.match(sql, /reporter_id = auth\.uid\(\)/);
assert.match(sql, /create policy user_reports_select_own/);
assert.match(sql, /using \(reporter_id = auth\.uid\(\)\)/);
assert.doesNotMatch(sqlWithoutComments, /create policy user_reports_select_all/);
assert.doesNotMatch(sqlWithoutComments, /grant update on table public\.user_reports to authenticated/);
assert.doesNotMatch(sqlWithoutComments, /grant delete on table public\.user_reports to authenticated/);

assert.match(sql, /create table if not exists public\.user_blocks/);
assert.match(sql, /primary key \(blocker_id, blocked_id\)/);
assert.match(sql, /constraint user_blocks_not_self check \(blocker_id <> blocked_id\)/);
assert.match(sql, /create policy user_blocks_select_own/);
assert.match(sql, /create policy user_blocks_insert_own/);
assert.match(sql, /create policy user_blocks_delete_own/);

assert.match(sql, /create or replace function public\.is_account_suspended\(p_user_id uuid\)/);
assert.match(sql, /create or replace function public\.is_blocked_pair\(p_user_a uuid, p_user_b uuid\)/);
assert.match(
  sql,
  /\(b\.blocker_id = p_user_a and b\.blocked_id = p_user_b\)\s+or \(b\.blocker_id = p_user_b and b\.blocked_id = p_user_a\)/
);

const isBlockedIdx = sql.indexOf("create or replace function public.is_blocked_pair");
const userBlocksIdx = sql.indexOf("create table if not exists public.user_blocks");
assert.ok(userBlocksIdx > 0 && isBlockedIdx > userBlocksIdx, "is_blocked_pair must be created after user_blocks");

assert.match(sql, /not public\.is_account_suspended\(p_sitter_id\)/);
assert.match(sql, /public\.is_blocked_pair\(auth\.uid\(\), target_id\)/);
assert.match(sql, /p\.suspended_at is null/);
assert.match(sql, /not public\.is_blocked_pair\(auth\.uid\(\), sp\.id\)/);
assert.match(sql, /not public\.is_blocked_pair\(parent_id, sitter_id\)/);
assert.match(sql, /lower\(btrim\(coalesce\(status, ''\)\)\) is distinct from 'approved'/);
assert.match(sql, /drop policy if exists messages_insert_participant on public\.messages/);
assert.match(sql, /not public\.is_blocked_pair\(b\.parent_id, b\.sitter_id\)/);
assert.match(sql, /not public\.is_account_suspended\(sp\.id\)/);
assert.match(sql, /broadcast_responses_enforce_safety/);
assert.match(sql, /on conflict \(user_id, kind, dedupe_key\)/);

assert.doesNotMatch(sql, /p_parent_lat/);
assert.doesNotMatch(sql, /p_parent_lng/);
assert.doesNotMatch(sql, /p_max_distance_km/);
assert.doesNotMatch(sql, /double precision,\s*double precision,\s*double precision/);
assert.doesNotMatch(sql, /expire_pending_bookings/);
assert.doesNotMatch(sql, /bookings_block_expired_pending_approval/);
assert.doesNotMatch(sql, /cron\.schedule/);
assert.doesNotMatch(sql, /delete_current_user/);
assert.doesNotMatch(sql, /end_shift_atomic/);
assert.doesNotMatch(sql, /finalize_verified_hyp_payment/);
assert.doesNotMatch(sql, /hidden_at/);
assert.doesNotMatch(sql, /ban_user/);

const searchFn = sql.slice(sql.lastIndexOf("create or replace function public.list_public_sitters_search("));
assert.match(searchFn, /p_service_type text default null/);
assert.match(searchFn, /'avatar_url',\s*coalesce\(/);
assert.doesNotMatch(searchFn, /u\.email/);

assert.equal(REPORT_CONFIRMATION_MESSAGE, "הדיווח נשלח");
assert.equal(REPORT_DETAILS_MAX_LENGTH, 2000);
assert.deepEqual(
  REPORT_REASONS.map((r) => r.id),
  ["abuse", "threats", "illegal", "spam_fraud", "inappropriate", "other"]
);
assert.equal(SELF_REPORT_MESSAGE.length > 0, true);
assert.equal(isSafetyUuid("11111111-1111-4111-8111-111111111111"), true);
assert.equal(isSafetyUuid("not-a-uuid"), false);

const reports = read("lib/safety/reports.ts");
assert.match(reports, /reporterId === reportedUserId/);
assert.match(reports, /SELF_REPORT_MESSAGE/);
assert.match(reports, /USER_REPORTS_TABLE/);
assert.match(reports, /target_type: input\.targetType \?\? "user"/);
assert.match(reports, /code === "23505"/);

const blocks = read("lib/safety/blocks.ts");
assert.match(blocks, /blockerId === blockedId/);
assert.match(blocks, /\.delete\(\)/);
assert.match(blocks, /blocker_id/);

const createBooking = read("lib/bookings/create-booking.ts");
assert.match(createBooking, /assertMarketplacePairAllowed/);
assert.match(createBooking, /status: "pending"/);

const chatSend = read("lib/chat/booking-messages.ts");
assert.match(chatSend, /assertMarketplacePairAllowed/);
assert.match(chatSend, /sendBookingMessage/);

const approve = read("lib/bookings/sitter-pending-bookings.ts");
assert.match(approve, /assertMarketplacePairAllowed/);
assert.match(approve, /status === "approved"/);

const broadcastParent = read("app/parent/broadcast/page.tsx");
assert.match(broadcastParent, /fetchIsAccountSuspended/);

const broadcastSitter = read("components/sitter/SitterBroadcastAlertModal.tsx");
assert.match(broadcastSitter, /assertMarketplacePairAllowed/);
assert.match(broadcastSitter, /broadcast_responses/);

const parentProfile = read("app/parent/sitter/[sitterId]/page.tsx");
assert.match(parentProfile, /UserSafetyActions/);
assert.doesNotMatch(parentProfile, /report.*message|report.*review/i);

const parentPreview = read("components/sitter/sitter-parent-profile-preview.tsx");
assert.match(parentPreview, /UserSafetyActions/);

const approvalCard = read("components/sitter/sitter-shift-approval-card.tsx");
assert.match(approvalCard, /UserSafetyActions/);

const chatHeader = read("components/chat/parent-chat-room.tsx");
assert.match(chatHeader, /UserSafetyActions/);
assert.match(chatHeader, /partnerId/);

const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
assert.match(parentSettings, /BlockedUsersSection/);
assert.match(sitterSettings, /BlockedUsersSection/);

const gate = read("components/safety/account-suspended-gate.tsx");
assert.match(gate, /החשבון מושעה/);
assert.match(gate, /ANYNANNY_SUPPORT_EMAIL/);
assert.match(gate, /DeleteAccountSection/);
assert.match(gate, /LogoutButton/);
assert.match(gate, /\/parent\/settings/);
assert.match(gate, /\/sitter\/settings/);
assert.match(gate, /\/session/);
assert.doesNotMatch(gate, /banUser|signOut\(\).*suspend/);

const auth = read("components/auth-provider.tsx");
assert.match(auth, /suspendedAt/);
assert.match(auth, /suspended_at/);

const productProfiles = read("lib/auth/product-profiles.ts");
assert.doesNotMatch(productProfiles, /suspendedAt/);

const adminAuth = read("lib/admin/auth.ts");
assert.match(adminAuth, /createHmac/);
assert.match(adminAuth, /timingSafeEqual/);
assert.match(adminAuth, /value === "1"/);
assert.doesNotMatch(adminAuth, /value:\s*"1"/);

const adminLogin = read("app/api/admin/login/route.ts");
assert.match(adminLogin, /adminAuthCookieOptions/);
assert.doesNotMatch(adminLogin, /value:\s*"1"/);

const requireAdmin = read("lib/admin/require-admin.ts");
assert.match(requireAdmin, /isValidAdminSessionValue/);
assert.match(requireAdmin, /requireAdminPage/);
assert.match(requireAdmin, /requireAdminApi/);

const adminReportsApi = read("app/api/admin/reports/route.ts");
assert.match(adminReportsApi, /requireAdminApi/);
assert.match(adminReportsApi, /getSupabaseServiceRoleClient/);

const adminReportAction = read("app/api/admin/reports/[id]/route.ts");
assert.match(adminReportAction, /requireAdminApi/);
assert.match(adminReportAction, /getSupabaseServiceRoleClient/);
assert.match(adminReportAction, /action === "suspend"/);
assert.match(adminReportAction, /action === "unsuspend"/);
assert.match(adminReportAction, /status: "resolved"/);
assert.doesNotMatch(adminReportAction, /user_metadata/);

const adminReportsPage = read("app/admin/reports/page.tsx");
assert.match(adminReportsPage, /requireAdminPage/);
assert.match(adminReportsPage, /AdminReportsTable/);

const chatLogs = read("app/admin/chat-logs/page.tsx");
assert.match(chatLogs, /requireAdminPage/);

const prevPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
const prevSecret = process.env.ADMIN_SESSION_SECRET;
process.env.ADMIN_DASHBOARD_PASSWORD = "ugc-test-password";
delete process.env.ADMIN_SESSION_SECRET;
assert.equal(isValidAdminSessionValue("1"), false);
assert.equal(isValidAdminSessionValue(""), false);
assert.equal(isValidAdminSessionValue("v1.1.deadbeef"), false);
const now = Date.parse("2026-08-23T18:00:00.000Z");
const token = createAdminSessionValue(now);
assert.equal(isValidAdminSessionValue(token, now), true);
assert.equal(isValidAdminSessionValue(token, now + 9 * 60 * 60 * 1000), false);
assert.equal(isValidAdminSessionValue("1", now), false);
if (prevPassword === undefined) delete process.env.ADMIN_DASHBOARD_PASSWORD;
else process.env.ADMIN_DASHBOARD_PASSWORD = prevPassword;
if (prevSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
else process.env.ADMIN_SESSION_SECRET = prevSecret;

const deleteAccount = read("lib/account/delete-current-user.ts");
assert.match(deleteAccount, /supabase\.rpc\("delete_current_user"\)/);
assert.doesNotMatch(deleteAccount, /user_reports|user_blocks|suspended_at/);

const hypFiles = [
  "lib/billing/hyp-payment-webhook.ts",
  "app/api/hyp/checkout/route.ts",
  "lib/billing/finalize-hyp-payment.ts"
];
for (const file of hypFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /user_reports|user_blocks|assertMarketplacePairAllowed/);
}

const terms = read("components/legal/terms-of-service-document.tsx");
const privacy = read("components/legal/privacy-policy-document.tsx");
const legal = read("lib/legal/acceptance.ts");
assert.doesNotMatch(terms, /user_reports/);
assert.doesNotMatch(privacy, /user_reports/);
assert.match(legal, /PRIVACY_DOC_VERSION = "1.1"/);
assert.match(legal, /TERMS_DOC_VERSION = LEGAL_DOC_VERSION/);

console.log("UGC safety moderation checks passed.");
