import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function assertEveryPublicQueryRequiresOnboarding(relativePath) {
  const source = read(relativePath);
  const publicFilter = '.eq("is_public", true)';
  let cursor = 0;
  let count = 0;

  while ((cursor = source.indexOf(publicFilter, cursor)) !== -1) {
    const queryTail = source.slice(cursor, cursor + 180);
    assert.match(
      queryTail,
      /\.not\((?:"onboarding_completed_at"|SITTER_ONBOARDING_COMPLETED_COLUMN), "is", null\)/,
      `${relativePath}: public sitter query is missing completed-onboarding ownership gate`
    );
    count += 1;
    cursor += publicFilter.length;
  }

  assert.ok(count > 0, `${relativePath}: expected at least one public sitter query`);
}

for (const path of [
  "lib/sitter/parent-sitter-search.ts",
  "lib/sitter/fetch-parent-sitter-profile.ts",
  "app/parent/dashboard/page.tsx",
  "app/parent/search/broadcast-radar/page.tsx"
]) {
  assertEveryPublicQueryRequiresOnboarding(path);
}

const route = read("app/api/parent/sitter/[id]/public/route.ts");
assert.doesNotMatch(
  route,
  /supabase\.rpc\("get_sitter_profile_public"/,
  "public detail route must not bypass the guarded profile loader"
);

const migration = read(
  "supabase/migrations/20260816140000_require_completed_sitter_onboarding_for_discovery.sql"
);
assert.match(
  migration,
  /where sp\.id = target_id[\s\S]*?sp\.onboarding_completed_at is not null;/,
  "detail RPC must reject incomplete sitter products"
);
assert.match(
  migration,
  /where coalesce\(sp\.is_public, false\) = true\s+and sp\.onboarding_completed_at is not null/,
  "search RPC must reject incomplete sitter products"
);

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
