import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const CROSS_USER_FILES = [
  "lib/sitter/parent-sitter-search.ts",
  "lib/sitter/fetch-parent-sitter-profile.ts",
  "app/parent/dashboard/page.tsx",
  "app/parent/search/broadcast-radar/page.tsx"
];

const tableSelect = /\.from\(\s*(?:SITTER_PROFILES_TABLE|"sitter_profiles")\s*\)/;

for (const path of CROSS_USER_FILES) {
  const source = read(path);
  assert.doesNotMatch(
    source,
    tableSelect,
    `${path}: F7 forbids cross-user sitter_profiles SELECT; use public RPCs`
  );
}

assert.match(
  read("lib/sitter/parent-sitter-search.ts"),
  /list_public_sitters_search/,
  "parent search must use list_public_sitters_search"
);
assert.match(
  read("lib/sitter/fetch-parent-sitter-profile.ts"),
  /get_sitter_profile_public/,
  "parent profile loader must use get_sitter_profile_public"
);

const route = read("app/api/parent/sitter/[id]/public/route.ts");
assert.doesNotMatch(
  route,
  /supabase\.rpc\("get_sitter_profile_public"/,
  "public detail route must not bypass the guarded profile loader"
);
assert.match(route, /fetchParentSitterProfile/);

const detailRpc = read(
  "supabase/migrations/20260823003000_respect_sitter_full_name_privacy.sql"
);
assert.match(
  detailRpc,
  /where sp\.id = target_id[\s\S]*?sp\.onboarding_completed_at is not null;/,
  "detail RPC must reject incomplete sitter products"
);

const searchRpc = read(
  "supabase/migrations/20260823003000_respect_sitter_full_name_privacy.sql"
);
assert.match(
  searchRpc,
  /where coalesce\(sp\.is_public, false\) = true\s+and sp\.onboarding_completed_at is not null/,
  "search RPC must reject incomplete sitter products"
);

const overloadDrop = read(
  "supabase/migrations/20260823002000_drop_obsolete_public_sitter_search_overload.sql"
);
assert.match(
  overloadDrop,
  /drop function if exists public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text,\s*double precision,\s*double precision,\s*double precision\s*\)/,
  "obsolete 12-arg search overload must be dropped"
);
assert.doesNotMatch(overloadDrop, /create or replace function/i);

const sqlRegression = read("sql/test_sitter_discovery_requires_completed_onboarding.sql");
assert.match(sqlRegression, /AN-1002/g, "AN-1002 must remain the negative regression fixture");
assert.match(sqlRegression, /public\.list_public_sitters_search\(/);
assert.match(sqlRegression, /public\.get_sitter_profile_public\(/);
assert.match(
  sqlRegression,
  /p\.role = 'parent'[\s\S]*?sp\.onboarding_completed_at is not null/,
  "dual-role completed sitter regression must remain covered"
);

console.log("Sitter discovery ownership regression checks passed.");
