import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const F7 = "supabase/migrations/20260822220000_sitter_profiles_private_select.sql";
const AVATAR_RPC = "supabase/migrations/20260823001000_public_sitter_rpc_avatar_source.sql";
const sql = read(F7);
const publicProfileSql = read(AVATAR_RPC);

const CROSS_USER_APP_FILES = [
  "lib/sitter/fetch-parent-sitter-profile.ts",
  "lib/sitter/parent-sitter-search.ts",
  "app/parent/dashboard/page.tsx",
  "app/parent/search/broadcast-radar/page.tsx",
  "components/parent/book-shift-modal.tsx",
  "lib/chat/booking-messages.ts",
  "lib/bookings/todays-linked-booking.ts",
  "components/session/session-rating-modal.tsx",
  "app/parent/history/page.tsx"
] as const;

const OWN_ROW_APP_FILES = [
  "lib/sitter/sitter-profile.ts",
  "lib/sitter/sitter-working-cities.ts",
  "lib/wallet/sitter-bank-details.ts",
  "lib/wallet/sitter-payout-methods.ts",
  "lib/identity/identity-verification.ts",
  "lib/availability/sitter-availability.ts",
  "components/sitter/sitter-onboarding-wizard.tsx",
  "app/sitter/dashboard/page.tsx"
] as const;

const SENSITIVE_PUBLIC_FIELDS = [
  "id_number",
  "address_full",
  "referee_phone_1",
  "referee_phone_2",
  "bank_code",
  "bank_name",
  "bank_branch",
  "bank_account_number",
  "payout_bit_phone",
  "payout_paybox_phone",
  "payout_card_holder",
  "payout_card_last4",
  "payout_card_exp_month",
  "payout_card_exp_year",
  "payout_card_id_number",
  "payout_hyp_token",
  "payout_hyp_tokef",
  "payout_hyp_trans_id",
  "birth_date"
] as const;

const APPROVED_PROFILE_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "nanny_serial",
  "display_name",
  "age_years",
  "languages",
  "years_experience",
  "bio",
  "hourly_rate_nis",
  "pricing_model",
  "package_price_nis",
  "service_types",
  "certifications",
  "citizenship_israeli",
  "birth_country",
  "aliyah_year",
  "preferred_ages",
  "has_car",
  "working_cities",
  "homework_help",
  "light_cooking",
  "updated_at",
  "is_public",
  "avg_rating",
  "rating_count",
  "avatar_url"
] as const;

const APPROVED_SEARCH_FIELDS = [
  "id",
  "nanny_serial",
  "first_name",
  "last_name",
  "display_name",
  "years_experience",
  "has_car",
  "working_cities",
  "bio",
  "hourly_rate_nis",
  "pricing_model",
  "package_price_nis",
  "service_types",
  "languages",
  "certifications",
  "avg_rating",
  "rating_count",
  "avatar_url"
] as const;

function extractJsonbBuildObjectKeys(source: string): string[] {
  const start = source.indexOf("jsonb_build_object(");
  assert.ok(start >= 0, "expected jsonb_build_object projection");
  const keys: string[] = [];
  const re =
    /'([a-z_]+)'\s*,\s*(?:\(|sp|spj|rt|u|p|dn|ay|photo|combined|nullif|coalesce|target_id)/g;
  const slice = source.slice(start, start + 2500);
  let match: RegExpExecArray | null;
  while ((match = re.exec(slice))) {
    keys.push(match[1]);
  }
  return keys;
}

// 1. Broad public SELECT policy is removed.
assert.match(sql, /drop policy if exists "sitter_profiles_select_public_authenticated"/);
assert.doesNotMatch(sql, /create policy "sitter_profiles_select_public_authenticated"/);

// 2. Own-row SELECT remains (this migration does not drop it).
assert.doesNotMatch(sql, /drop policy if exists "sitter_profiles_select_own"/);
assert.doesNotMatch(sql, /drop policy if exists sitter_profiles_insert_own/);
assert.doesNotMatch(sql, /drop policy if exists "sitter_profiles_update_own"/);
const ownRowSql = read("supabase/migrations/20260727170000_sitter_profiles_bank_details.sql");
assert.match(ownRowSql, /create policy "sitter_profiles_select_own"/);
assert.match(ownRowSql, /auth\.uid\(\) = id/);

// 3–5. Public RPC projections.
const searchFn = publicProfileSql.slice(
  publicProfileSql.indexOf("create or replace function public.list_public_sitters_search")
);
assert.match(searchFn, /security definer/);
assert.match(searchFn, /set search_path = public/);
assert.match(sql, /grant execute on function public.list_public_sitters_search\(/);
assert.match(sql, /grant execute on function public.get_sitter_profile_public\(uuid\) to authenticated/);
assert.doesNotMatch(searchFn, /'email'/);
assert.doesNotMatch(searchFn, /u\.email/);

const searchKeys = extractJsonbBuildObjectKeys(searchFn);
assert.deepEqual([...new Set(searchKeys)], [...APPROVED_SEARCH_FIELDS]);
for (const field of SENSITIVE_PUBLIC_FIELDS) {
  assert.doesNotMatch(searchFn, new RegExp(`'${field}'`));
}

const profileReturnStart = publicProfileSql.indexOf("return jsonb_build_object(");
assert.ok(profileReturnStart >= 0, "get_sitter_profile_public must return jsonb_build_object");
const profileReturn = publicProfileSql.slice(
  profileReturnStart,
  publicProfileSql.indexOf("end;", profileReturnStart)
);
const profileKeys = extractJsonbBuildObjectKeys(profileReturn);
assert.deepEqual([...new Set(profileKeys)], [...APPROVED_PROFILE_FIELDS]);
for (const field of SENSITIVE_PUBLIC_FIELDS) {
  assert.doesNotMatch(profileReturn, new RegExp(`'${field}'`));
}

// 6. Booking INSERT eligibility uses SECURITY DEFINER boolean helper.
assert.match(sql, /create or replace function public\.is_public_sitter\(p_sitter_id uuid\)/);
assert.match(sql, /returns boolean/);
assert.match(sql, /security definer/);
assert.match(sql, /set search_path = public/);
assert.match(sql, /revoke all on function public\.is_public_sitter\(uuid\) from public/);
assert.match(sql, /revoke all on function public\.is_public_sitter\(uuid\) from anon/);
assert.match(sql, /grant execute on function public\.is_public_sitter\(uuid\) to authenticated/);
assert.match(sql, /and public\.is_public_sitter\(sitter_id\)/);
assert.doesNotMatch(
  sql.slice(sql.indexOf("create policy bookings_insert_parent")),
  /exists \(\s*select 1\s+from public\.sitter_profiles/
);

// 7. Cross-user app code no longer uses direct sitter_profiles SELECT.
const tableSelect = /\.from\(\s*(?:SITTER_PROFILES_TABLE|"sitter_profiles")\s*\)/;
for (const relativePath of CROSS_USER_APP_FILES) {
  const source = read(relativePath);
  assert.doesNotMatch(source, tableSelect, `${relativePath} still selects sitter_profiles`);
  assert.doesNotMatch(source, /sitter_profiles\s*\(/, `${relativePath} still embeds sitter_profiles`);
}

assert.match(read("lib/sitter/fetch-parent-sitter-profile.ts"), /get_sitter_profile_public/);
assert.match(read("lib/sitter/parent-sitter-search.ts"), /list_public_sitters_search/);
assert.match(read("app/parent/dashboard/page.tsx"), /listPublicSittersForDashboard/);
assert.match(read("app/parent/search/broadcast-radar/page.tsx"), /fetchPublicSitterProfileViaRpc/);
assert.match(read("components/parent/book-shift-modal.tsx"), /fetchPublicSitterProfileViaRpc/);
assert.match(read("lib/chat/booking-messages.ts"), /fetchPublicSitterProfileViaRpc/);
assert.match(read("lib/bookings/todays-linked-booking.ts"), /fetchPublicSitterProfileViaRpc/);
assert.match(read("components/session/session-rating-modal.tsx"), /fetchPublicSitterProfileViaRpc/);
assert.match(read("app/parent/history/page.tsx"), /fetchPublicSitterProfilesViaRpc/);

// 8. Own-row sitter flows may still use sitter_profiles directly.
for (const relativePath of OWN_ROW_APP_FILES) {
  const source = read(relativePath);
  assert.match(source, tableSelect, `${relativePath} should keep own-row sitter_profiles access`);
}

// 9–10. Public RPCs still exist and require completed onboarding.
assert.match(publicProfileSql, /create or replace function public\.get_sitter_profile_public\(target_id uuid\)/);
assert.match(publicProfileSql, /sp\.onboarding_completed_at is not null/);
assert.match(searchFn, /sp\.onboarding_completed_at is not null/);
assert.match(searchFn, /sitter_window_is_available/);

// 11–12. Direct booking and NOW write paths still set booking_source.
const createBooking = read("lib/bookings/create-booking.ts");
const bookShift = read("components/parent/book-shift-modal.tsx");
const radar = read("app/parent/search/broadcast-radar/page.tsx");
assert.match(createBooking, /bookingSource/);
assert.match(bookShift, /bookingSource:\s*"direct"/);
assert.match(radar, /bookingSource:\s*"broadcast_now"/);
assert.match(bookShift, /createBooking\(/);
assert.match(radar, /createBooking\(/);

// 13–14. Lifecycle + canonical notification contracts are unchanged by F7.
const lifecycle = read("supabase/migrations/20260822200000_booking_source_pending_lifecycle.sql");
const pendingLifecycle = read("supabase/migrations/20260821120000_pending_booking_lifecycle.sql");
assert.doesNotMatch(sql, /create or replace function public\.expire_pending_bookings/);
assert.doesNotMatch(sql, /create or replace function public\.bookings_block_expired_pending_approval/);
assert.doesNotMatch(sql, /ENABLE TRIGGER bookings_block_expired_pending_approval/i);
assert.doesNotMatch(sql, /cron\.schedule/);
assert.match(lifecycle, /booking_source = 'direct'/);
assert.match(pendingLifecycle, /notify_pending_no_response_reminders/);
const canonical = read("lib/notifications/kinds.ts");
assert.match(canonical, /CANONICAL_NOTIFICATION_KINDS/);

console.log("F7 sitter_profiles private-select checks passed.");
