import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentityVerified, parseIdentityVerificationStatus } from "../lib/identity/identity-verification";
import {
  defaultParentSearchFilters,
  matchesParentSearchVerifiedOnly,
  normalizeParentSearchFilters,
  PARENT_SEARCH_VERIFIED_ONLY_HINT,
  PARENT_SEARCH_VERIFIED_ONLY_LABEL,
  parentSearchFiltersPath,
  parentSearchFiltersToUrlSearchParams,
  parseFiltersFromSearchParams,
  parseParentSearchVerifiedOnly,
  toListPublicSittersSearchRpcArgs
} from "../lib/sitter/parent-search-filters";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260906180000_list_public_sitters_search_verified_only.sql";
const sql = read(MIGRATION);
const searchFn = sql.slice(sql.lastIndexOf("create or replace function public.list_public_sitters_search("));
const searchProjection = searchFn.slice(
  searchFn.indexOf("jsonb_build_object("),
  searchFn.indexOf("order by rt.avg_rating")
);
const filtersLib = read("lib/sitter/parent-search-filters.ts");
const searchUi = read("components/parent/parent-search-filters.tsx");
const searchImpl = read("lib/sitter/parent-sitter-search.ts");
const resultsPage = read("app/parent/search/results/page.tsx");
const identityLib = read("lib/identity/identity-verification.ts");
const badge = read("components/identity/verified-user-badge.tsx");

const PRIVATE_KYC_FIELDS = [
  "identity_id_number",
  "identity_verification_method",
  "identity_verified_at",
  "identity_verification_status",
  "id_number",
  "session_id",
  "didit",
  "kyc",
  "document"
] as const;

const STATUSES = ["unverified", "pending", "verified", "failed"] as const;

// 1. verified-only filter defaults to OFF
const defaults = defaultParentSearchFilters();
assert.equal(defaults.verifiedOnly, false);
assert.equal(normalizeParentSearchFilters({}).verifiedOnly, false);
assert.equal(normalizeParentSearchFilters().verifiedOnly, false);

const defaultRpc = toListPublicSittersSearchRpcArgs(defaults);
assert.equal("p_verified_only" in defaultRpc, false);

// 2. OFF returns existing mix of verified/unverified sitters
assert.equal(matchesParentSearchVerifiedOnly("verified", false), true);
assert.equal(matchesParentSearchVerifiedOnly("unverified", false), true);
assert.equal(matchesParentSearchVerifiedOnly("pending", false), true);
assert.equal(matchesParentSearchVerifiedOnly("failed", false), true);
assert.equal(matchesParentSearchVerifiedOnly(null, false), true);
const offMix = STATUSES.filter((status) => matchesParentSearchVerifiedOnly(status, false));
assert.deepEqual(offMix, [...STATUSES]);

// 3. ON returns only verified sitters
const onOnly = STATUSES.filter((status) => matchesParentSearchVerifiedOnly(status, true));
assert.deepEqual(onOnly, ["verified"]);
assert.match(searchFn, /not f\.verified_only\s+or p\.identity_verification_status = 'verified'/);
assert.match(searchFn, /coalesce\(p_verified_only, false\) as verified_only/);
assert.match(filtersLib, /isIdentityVerified/);
assert.match(identityLib, /return status === "verified"/);

// 4. unverified sitter is excluded when ON
assert.equal(matchesParentSearchVerifiedOnly("unverified", true), false);
assert.equal(matchesParentSearchVerifiedOnly("pending", true), false);
assert.equal(matchesParentSearchVerifiedOnly("failed", true), false);
assert.equal(matchesParentSearchVerifiedOnly(null, true), false);
assert.equal(isIdentityVerified(parseIdentityVerificationStatus("unverified")), false);

// 5. verified sitter is included when ON
assert.equal(matchesParentSearchVerifiedOnly("verified", true), true);
assert.equal(isIdentityVerified(parseIdentityVerificationStatus("verified")), true);

const onRpc = toListPublicSittersSearchRpcArgs(
  normalizeParentSearchFilters({ verifiedOnly: true, selectedCity: "חיפה", minRating: "4" })
);
assert.equal(onRpc.p_verified_only, true);

// 6. filter combines correctly with at least one existing filter
assert.equal(onRpc.p_search_city, "חיפה");
assert.equal(onRpc.p_min_rating, 4);
assert.equal(onRpc.p_service_type, "babysitter");
assert.match(searchFn, /working_cities[\s\S]*@>\s*array\[f\.search_city\]/);
assert.match(searchFn, /not f\.verified_only[\s\S]*identity_verification_status = 'verified'/);

// 7. missing verifiedOnly parameter behaves as false
assert.equal(parseParentSearchVerifiedOnly(null), false);
assert.equal(parseParentSearchVerifiedOnly(""), false);
assert.equal(parseParentSearchVerifiedOnly("0"), false);
assert.equal(parseParentSearchVerifiedOnly("false"), false);
assert.equal(parseParentSearchVerifiedOnly("1"), true);
assert.equal(parseParentSearchVerifiedOnly("true"), true);

const missingParamFilters = parseFiltersFromSearchParams(new URLSearchParams("city=חיפה&minRating=4"));
assert.equal(missingParamFilters.verifiedOnly, false);
assert.equal(missingParamFilters.selectedCity, "חיפה");
assert.equal(missingParamFilters.minRating, "4");
assert.equal("verifiedOnly" in Object.fromEntries(parentSearchFiltersToUrlSearchParams(missingParamFilters)), false);

const onParams = parentSearchFiltersToUrlSearchParams(
  normalizeParentSearchFilters({ selectedCity: "חיפה", verifiedOnly: true })
);
assert.equal(onParams.get("verifiedOnly"), "1");
assert.equal(onParams.get("city"), "חיפה");
assert.equal(parseFiltersFromSearchParams(onParams).verifiedOnly, true);
assert.equal(parentSearchFiltersPath(normalizeParentSearchFilters({ verifiedOnly: true })).includes("verifiedOnly=1"), true);
assert.match(resultsPage, /parentSearchFiltersPath\(filters\)/);

// 8. unrelated search behavior remains unchanged
const baseline = toListPublicSittersSearchRpcArgs(
  normalizeParentSearchFilters({ selectedCity: "חיפה", minRating: "4", minYearsExperience: 3 })
);
const withOff = toListPublicSittersSearchRpcArgs(
  normalizeParentSearchFilters({
    selectedCity: "חיפה",
    minRating: "4",
    minYearsExperience: 3,
    verifiedOnly: false
  })
);
assert.deepEqual(baseline, withOff);
assert.equal(baseline.p_search_city, "חיפה");
assert.equal(baseline.p_min_rating, 4);
assert.equal(baseline.p_min_years_experience, 3);
assert.equal("p_verified_only" in baseline, false);

assert.match(searchFn, /p_service_type text default null/);
assert.match(searchFn, /p_verified_only boolean default false/);
assert.match(
  sql,
  /grant execute on function public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text,\s*boolean\s*\) to authenticated/
);
assert.match(
  sql,
  /drop function if exists public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text\s*\)/
);
assert.doesNotMatch(searchFn, /p_parent_lat/);
assert.match(searchImpl, /p_verified_only/);
assert.match(resultsPage, /לא נמצאו בייביסיטרים פנויים לשעות שבחרת/);

// 9. no private KYC/identity metadata is exposed
for (const field of PRIVATE_KYC_FIELDS) {
  assert.doesNotMatch(searchProjection, new RegExp(`'${field}'`), `search JSON must not expose ${field}`);
}
assert.doesNotMatch(searchProjection, /'identity_verified'/);
assert.doesNotMatch(searchFn, /identity_id_number/);
assert.doesNotMatch(searchFn, /didit_sessions/);
assert.doesNotMatch(sql, /drop policy/i);
assert.doesNotMatch(sql, /create policy/i);
assert.match(sql, /Does not expose identity documents/);

// 10. RTL/UI label text is correct
assert.equal(PARENT_SEARCH_VERIFIED_ONLY_LABEL, "זהות מאומתת בלבד");
assert.equal(
  PARENT_SEARCH_VERIFIED_ONLY_HINT,
  "יוצגו רק בייביסיטריות שעברו אימות זהות במערכת AnyNanny."
);
assert.match(searchUi, /dir="rtl"/);
assert.match(searchUi, /PARENT_SEARCH_VERIFIED_ONLY_LABEL/);
assert.match(searchUi, /PARENT_SEARCH_VERIFIED_ONLY_HINT/);
assert.match(searchUi, /IdentityShieldMark/);
assert.match(searchUi, /aria-labelledby="verified-only-heading"/);
assert.match(searchUi, /aria-describedby="verified-only-hint"/);
assert.match(searchUi, /type="checkbox"/);
assert.match(badge, /export function IdentityShieldMark/);
assert.match(badge, /GOLD_MARK_SURFACE/);
assert.match(badge, /ShieldCheck/);

const laterSearchCreates = readdirSync(resolve(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql") && name > "20260823160000_ugc_safety_moderation.sql")
  .filter((name) =>
    /create or replace function public\.list_public_sitters_search\(/.test(
      readFileSync(resolve(root, "supabase/migrations", name), "utf8")
    )
  );
assert.ok(
  laterSearchCreates.includes("20260906180000_list_public_sitters_search_verified_only.sql"),
  "verified-only search migration must be the latest list_public_sitters_search recreate"
);
assert.equal(laterSearchCreates.sort().at(-1), "20260906180000_list_public_sitters_search_verified_only.sql");

console.log("Parent search verified-only filter checks passed.");
