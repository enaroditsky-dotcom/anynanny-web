import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeSitterProfilePublic,
  publicSitterDisplayName
} from "../lib/sitter/fetch-parent-sitter-profile";
import { resolveSitterCardTitle } from "../lib/sitter/public-search-card";
import type { PublicSitterSearchCard } from "../lib/sitter/sitter-profile";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const F20 = "supabase/migrations/20260823003000_respect_sitter_full_name_privacy.sql";
const OVERLOAD = "supabase/migrations/20260823002000_drop_obsolete_public_sitter_search_overload.sql";
const AVATAR = "supabase/migrations/20260823001000_public_sitter_rpc_avatar_source.sql";
const sql = read(F20);

assert.ok(F20 > "20260823002000_drop_obsolete_public_sitter_search_overload.sql");
assert.match(read(OVERLOAD), /drop function if exists public\.list_public_sitters_search\(/);

const profileFn = sql.slice(
  sql.indexOf("create or replace function public.get_sitter_profile_public"),
  sql.indexOf("create or replace function public.list_public_sitters_search")
);
const searchFn = sql.slice(sql.indexOf("create or replace function public.list_public_sitters_search"));
const profileReturn = profileFn.slice(profileFn.indexOf("return jsonb_build_object("));
const searchProjection = searchFn.slice(
  searchFn.indexOf("jsonb_build_object("),
  searchFn.indexOf("order by rt.avg_rating")
);

assert.match(profileFn, /security definer/);
assert.match(searchFn, /security definer/);
assert.match(profileFn, /set search_path = public/);
assert.match(searchFn, /set search_path = public/);
assert.match(sql, /grant execute on function public\.get_sitter_profile_public\(uuid\) to authenticated/);
assert.match(
  sql,
  /grant execute on function public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text\s*\) to authenticated/
);
assert.match(sql, /revoke all on function public\.get_sitter_profile_public\(uuid\) from public/);
assert.match(sql, /revoke all on function public\.get_sitter_profile_public\(uuid\) from anon/);

const searchHeader = searchFn.slice(0, searchFn.indexOf("returns jsonb"));
assert.match(searchHeader, /p_service_type text default null/);
assert.doesNotMatch(searchHeader, /p_parent_lat/);
assert.doesNotMatch(searchHeader, /p_parent_lng/);
assert.doesNotMatch(searchHeader, /p_max_distance_km/);
assert.doesNotMatch(sql, /double precision,\s*double precision,\s*double precision/);

assert.match(profileFn, /coalesce\(sp\.is_public, false\) = true/);
assert.match(profileFn, /sp\.onboarding_completed_at is not null/);
assert.match(searchFn, /where coalesce\(sp\.is_public, false\) = true\s+and sp\.onboarding_completed_at is not null/);

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

assert.doesNotMatch(profileReturn, /'email'/);
assert.doesNotMatch(searchProjection, /'email'/);
assert.doesNotMatch(searchFn, /u\.email/);
assert.doesNotMatch(profileReturn, /'show_full_name'/);
assert.doesNotMatch(searchProjection, /'show_full_name'/);
assert.doesNotMatch(profileReturn, /'birth_date'/);
assert.doesNotMatch(searchProjection, /'birth_date'/);

assert.match(profileReturn, /'last_name',\s*ln/);
assert.match(profileFn, /if show_full then[\s\S]*ln := last_n;[\s\S]*else[\s\S]*ln := null;/);
assert.match(profileFn, /if show_full then[\s\S]*dn := combined;[\s\S]*else[\s\S]*dn := first_n;/);

assert.match(
  searchProjection,
  /'last_name',\s*case\s+when coalesce\(sp\.show_full_name, false\) then nullif\(trim\(sp\.last_name\), ''\)\s+else null\s+end/
);
assert.match(
  searchProjection,
  /'display_name',\s*case\s+when coalesce\(sp\.show_full_name, false\) then nullif\(trim\(concat_ws\(/
);
assert.match(searchProjection, /else nullif\(trim\(sp\.first_name\), ''\)\s+end/);
assert.doesNotMatch(searchProjection, /(?<![a-z_])p\.first_name/);
assert.doesNotMatch(searchProjection, /(?<![a-z_])p\.last_name/);

assert.doesNotMatch(sql, /drop policy if exists "sitter_profiles_select_public_authenticated"/);
assert.doesNotMatch(sql, /create policy "sitter_profiles_select/);
assert.doesNotMatch(sql, /expire_pending_bookings/);
assert.doesNotMatch(sql, /bookings_block_expired_pending_approval/);
assert.doesNotMatch(sql, /cron\.schedule/);

assert.match(read(AVATAR), /'avatar_url',\s*photo/);

const parentProfile = read("app/parent/sitter/[sitterId]/page.tsx");
assert.match(parentProfile, /publicSitterDisplayName/);
assert.doesNotMatch(parentProfile, /formatSitterDisplayName/);

const radar = read("app/parent/search/broadcast-radar/page.tsx");
assert.match(radar, /publicSitterDisplayName\(sitterProfile\)/);
assert.doesNotMatch(
  radar.slice(radar.indexOf("const addSitterToResponders")),
  /\.from\("profiles"\)/
);

function card(partial: Partial<PublicSitterSearchCard>): PublicSitterSearchCard {
  return {
    id: "sitter-1",
    first_name: null,
    last_name: null,
    display_name: null,
    years_experience: null,
    has_car: false,
    bio: null,
    hourly_rate_nis: null,
    avg_rating: null,
    rating_count: 0,
    ...partial
  };
}

assert.equal(
  resolveSitterCardTitle(card({ first_name: "דנה", last_name: null, display_name: "דנה" })),
  "דנה"
);
assert.equal(
  resolveSitterCardTitle(card({ first_name: "דנה", last_name: "כהן", display_name: "דנה כהן" })),
  "דנה כהן"
);
assert.equal(
  resolveSitterCardTitle(card({ first_name: "דנה", last_name: "כהן", display_name: "דנה" })),
  "דנה"
);
assert.equal(
  resolveSitterCardTitle(card({ first_name: "דנה", last_name: "כהן", display_name: null })),
  "דנה"
);
assert.equal(
  resolveSitterCardTitle(card({ first_name: null, last_name: "כהן", display_name: null, nanny_serial: "AN-1001" })),
  "נני מס' AN-1001"
);
assert.equal(
  resolveSitterCardTitle(card({ first_name: null, last_name: null, display_name: null, nanny_serial: "CONS-1001" })),
  "יועצת מס' CONS-1001"
);

const hidden = normalizeSitterProfilePublic(
  { first_name: "דנה", last_name: "כהן", display_name: "דנה" },
  "sitter-1"
);
assert.equal(hidden.display_name, "דנה");
assert.equal(hidden.last_name, "כהן");
assert.equal(publicSitterDisplayName(hidden), "דנה");

const shown = normalizeSitterProfilePublic(
  { first_name: "דנה", last_name: "כהן", display_name: "דנה כהן" },
  "sitter-1"
);
assert.equal(shown.display_name, "דנה כהן");
assert.equal(publicSitterDisplayName(shown), "דנה כהן");

const missingDisplay = normalizeSitterProfilePublic(
  { first_name: "דנה", last_name: "כהן" },
  "sitter-1"
);
assert.equal(missingDisplay.display_name, "דנה");
assert.equal(publicSitterDisplayName(missingDisplay), "דנה");

console.log("F20 sitter full-name privacy checks passed.");
