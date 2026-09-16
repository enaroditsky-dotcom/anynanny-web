import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSitterProfilePublic } from "../lib/sitter/fetch-parent-sitter-profile";
import { normalizePublicSearchCard } from "../lib/sitter/public-search-card";
import { VERIFIED_IDENTITY_LABEL } from "../components/identity/verified-user-badge";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260917013000_public_sitter_identity_verified_badge.sql";
const sql = read(MIGRATION);
const profileFn = sql.slice(
  sql.indexOf("create or replace function public.get_sitter_profile_public"),
  sql.indexOf("create or replace function public.list_public_sitters_search")
);
const searchFn = sql.slice(sql.lastIndexOf("create or replace function public.list_public_sitters_search("));
const searchProjection = searchFn.slice(
  searchFn.indexOf("jsonb_build_object("),
  searchFn.indexOf("order by rt.avg_rating")
);
const profileReturn = profileFn.slice(profileFn.indexOf("return jsonb_build_object("));

assert.equal(VERIFIED_IDENTITY_LABEL, "זהות מאומתת");

assert.match(
  profileReturn,
  /'identity_verified',\s*coalesce\(identity_ok, false\)/
);
assert.match(
  searchProjection,
  /'identity_verified',\s*\(coalesce\(p\.identity_verification_status, 'unverified'\) = 'verified'\)/
);
assert.match(profileFn, /coalesce\(pr\.identity_verification_status, 'unverified'\) = 'verified'/);
assert.match(searchFn, /p\.identity_verification_status = 'verified'/);

for (const field of [
  "identity_verification_status",
  "identity_verified_at",
  "identity_verification_method",
  "identity_id_number"
] as const) {
  assert.doesNotMatch(profileReturn, new RegExp(`'${field}'`), `profile JSON must not expose ${field}`);
  assert.doesNotMatch(searchProjection, new RegExp(`'${field}'`), `search JSON must not expose ${field}`);
}

const verifiedCard = normalizePublicSearchCard({
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "נועה",
  identity_verified: true
});
assert.equal(verifiedCard?.identity_verified, true);

const unverifiedCard = normalizePublicSearchCard({
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "דנה",
  identity_verified: false
});
assert.equal(unverifiedCard?.identity_verified, false);

const verifiedProfile = normalizeSitterProfilePublic(
  { id: "11111111-1111-4111-8111-111111111111", identity_verified: true },
  "11111111-1111-4111-8111-111111111111"
);
assert.equal(verifiedProfile.identity_verified, true);

const statusProfile = normalizeSitterProfilePublic(
  {
    id: "11111111-1111-4111-8111-111111111111",
    identity_verification_status: "verified"
  },
  "11111111-1111-4111-8111-111111111111"
);
assert.equal(statusProfile.identity_verified, true);

const pendingProfile = normalizeSitterProfilePublic(
  {
    id: "11111111-1111-4111-8111-111111111111",
    identity_verification_status: "pending"
  },
  "11111111-1111-4111-8111-111111111111"
);
assert.equal(pendingProfile.identity_verified, false);

const searchCard = read("components/sitter/public-sitter-search-card.tsx");
assert.match(searchCard, /sitter\.identity_verified/);
assert.match(searchCard, /VerifiedUserBadge/);
assert.match(searchCard, /VERIFIED_IDENTITY_LABEL/);

const profilePage = read("app/parent/sitter/[sitterId]/page.tsx");
assert.match(profilePage, /profile\.identity_verified/);
assert.match(profilePage, /VERIFIED_IDENTITY_LABEL/);
assert.match(profilePage, /VerifiedUserBadge/);

const radar = read("app/parent/search/broadcast-radar/page.tsx");
assert.match(radar, /identityVerified: sitterProfile\.identity_verified === true/);
assert.match(radar, /sitter\.identityVerified/);
assert.match(radar, /VerifiedUserBadge/);
assert.match(radar, /VERIFIED_IDENTITY_LABEL/);
assert.doesNotMatch(radar, /IdentityVerifiedBadgeLive/);
assert.doesNotMatch(searchCard, /IdentityVerifiedBadgeLive/);
assert.doesNotMatch(profilePage, /IdentityVerifiedBadgeLive/);

console.log("parent-facing sitter identity badge checks passed");
