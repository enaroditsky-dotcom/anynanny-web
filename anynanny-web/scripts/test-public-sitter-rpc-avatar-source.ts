import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const AVATAR = "supabase/migrations/20260823001000_public_sitter_rpc_avatar_source.sql";
const F7 = "supabase/migrations/20260822220000_sitter_profiles_private_select.sql";
const sql = read(AVATAR);
const f7 = read(F7);

const SENSITIVE = [
  "id_number",
  "address_full",
  "referee_phone_1",
  "referee_phone_2",
  "bank_account_number",
  "payout_hyp_token",
  "email"
] as const;

const EXTRA_PROFILE_COLUMNS = [
  "phone",
  "address",
  "role",
  "identity_verification_status",
  "parent_serial",
  "balance"
] as const;

assert.match(sql, /create or replace function public\.get_sitter_profile_public\(target_id uuid\)/);
assert.match(sql, /create or replace function public\.list_public_sitters_search\(/);
assert.match(sql, /security definer/);
assert.match(sql, /set search_path = public/);
assert.match(sql, /grant execute on function public\.get_sitter_profile_public\(uuid\) to authenticated/);
assert.match(sql, /grant execute on function public\.list_public_sitters_search\(/);

const profileFn = sql.slice(
  sql.indexOf("create or replace function public.get_sitter_profile_public"),
  sql.indexOf("create or replace function public.list_public_sitters_search")
);
const searchFn = sql.slice(sql.indexOf("create or replace function public.list_public_sitters_search"));

assert.match(profileFn, /'avatar_url',\s*photo/);
assert.match(
  profileFn,
  /select nullif\(trim\(pr\.avatar_url\), ''\) from public\.profiles pr where pr\.id = target_id/
);
assert.match(
  profileFn,
  /coalesce\(\s*\(select nullif\(trim\(pr\.avatar_url\), ''\) from public\.profiles pr where pr\.id = target_id\),\s*\(select nullif\(trim\(u\.raw_user_meta_data->>'avatar_url'\), ''\) from auth\.users u where u\.id = target_id\)/
);

assert.match(
  searchFn,
  /'avatar_url',\s*coalesce\(\s*nullif\(trim\(p\.avatar_url\), ''\),\s*nullif\(trim\(u\.raw_user_meta_data->>'avatar_url'\), ''\)/
);

const profileReturn = profileFn.slice(profileFn.indexOf("return jsonb_build_object("));
const searchProjection = searchFn.slice(searchFn.indexOf("jsonb_build_object("), searchFn.indexOf("order by rt.avg_rating"));
assert.doesNotMatch(profileReturn, /'birth_date'/);
assert.doesNotMatch(searchProjection, /'birth_date'/);

for (const field of SENSITIVE) {
  assert.doesNotMatch(profileReturn, new RegExp(`'${field}'`));
  assert.doesNotMatch(searchProjection, new RegExp(`'${field}'`));
}

for (const field of EXTRA_PROFILE_COLUMNS) {
  assert.doesNotMatch(profileFn, new RegExp(`'${field}'`));
  assert.doesNotMatch(searchFn, new RegExp(`'${field}'`));
}

assert.doesNotMatch(sql, /drop policy if exists "sitter_profiles_select_public_authenticated"/);
assert.match(f7, /drop policy if exists "sitter_profiles_select_public_authenticated"/);
assert.match(f7, /public\.is_public_sitter/);

const loader = read("lib/sitter/fetch-parent-sitter-profile.ts");
assert.match(loader, /avatar_url: pickString\(raw, "avatar_url", "avatarUrl"\)/);
assert.doesNotMatch(loader, /\.from\(\s*(?:PROFILES_TABLE|"profiles")\s*\)/);
assert.doesNotMatch(loader, /\.from\(\s*(?:SITTER_PROFILES_TABLE|"sitter_profiles")\s*\)/);

const searchCard = read("lib/sitter/public-search-card.ts");
assert.match(searchCard, /avatar_url: pickString\(row, "avatar_url", "avatarUrl"\)/);

console.log("Public sitter RPC avatar source checks passed.");
