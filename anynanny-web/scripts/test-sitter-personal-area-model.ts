import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractMissingSitterProfileColumn,
  SITTER_PROFILE_OWN_SELECT_COLUMNS,
  SITTER_PROFILE_PRIVATE_PAYOUT_COLUMNS,
  sitterProfileOwnSelectClause
} from "../lib/sitter/sitter-profile";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(
  extractMissingSitterProfileColumn("column sitter_profiles.user_id does not exist"),
  "user_id"
);
assert.equal(
  extractMissingSitterProfileColumn(
    "Could not find the 'user_id' column of 'sitter_profiles' in the schema cache"
  ),
  "user_id"
);
assert.equal(
  extractMissingSitterProfileColumn(
    'column "referee_phone_1" of relation "sitter_profiles" does not exist'
  ),
  "referee_phone_1"
);
assert.equal(extractMissingSitterProfileColumn("permission denied for table sitter_profiles"), null);

const ownSelect = SITTER_PROFILE_OWN_SELECT_COLUMNS as readonly string[];
assert.ok(ownSelect.includes("id"));
assert.ok(ownSelect.includes("first_name"));
assert.ok(ownSelect.includes("last_name"));
assert.ok(ownSelect.includes("birth_date"));
assert.ok(ownSelect.includes("id_number"));
assert.ok(ownSelect.includes("hourly_rate_nis"));
assert.ok(ownSelect.includes("years_experience"));
assert.ok(ownSelect.includes("languages"));
assert.ok(ownSelect.includes("working_cities"));
assert.ok(ownSelect.includes("home_city"));
assert.ok(ownSelect.includes("desired_hours_per_week"));
assert.ok(ownSelect.includes("has_drivers_license"));
assert.ok(ownSelect.includes("nanny_serial"));
assert.ok(!ownSelect.includes("user_id"));
for (const column of SITTER_PROFILE_PRIVATE_PAYOUT_COLUMNS) {
  assert.ok(!ownSelect.includes(column));
}
assert.doesNotMatch(sitterProfileOwnSelectClause(), /\buser_id\b/);
assert.doesNotMatch(sitterProfileOwnSelectClause(), /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);

const fetchOwn = read("lib/sitter/sitter-profile.ts");
assert.match(fetchOwn, /\.eq\("id", userId\)/);
assert.doesNotMatch(
  fetchOwn.slice(
    fetchOwn.indexOf("export async function fetchOwnSitterProfileRow"),
    fetchOwn.indexOf("export const SITTER_LANGUAGE_OPTIONS")
  ),
  /\.eq\(["']user_id["']/
);

const profileApi = read("app/api/sitter/profile/route.ts");
assert.match(profileApi, /fetchOwnSitterProfileRow/);
assert.doesNotMatch(profileApi, /\.select\(["']\*["']\)/);
assert.doesNotMatch(profileApi, /\.eq\(["']user_id["']/);

const personal = read("components/sitter/sitter-personal-area.tsx");
assert.match(personal, /editKey === "first_name" && !draft\.first_name\.trim\(\)/);
assert.match(personal, /editKey === "last_name" && !draft\.last_name\.trim\(\)/);
assert.doesNotMatch(
  personal,
  /editKey !== "avatar" && \(!draft\.first_name\.trim\(\) \|\| !draft\.last_name\.trim\(\)\)/
);
assert.match(personal, /SitterManualReceivingDestinationsSection/);
assert.match(personal, /אזור עבודה מועדף/);
assert.doesNotMatch(personal, /זמינות כללית|generic availability/);
assert.match(personal, /requestSaveOwnContactPhone/);

const payoutLib = read("lib/wallet/sitter-payout-methods.ts");
assert.match(payoutLib, /sitter_own_manual_payout_destinations/);

console.log("test-sitter-personal-area-model: PASS");
