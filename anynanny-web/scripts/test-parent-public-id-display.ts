import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARENT_DISPLAY_ID_STORAGE_KEY,
  SITTER_DISPLAY_ID_STORAGE_KEY,
  cacheParentDisplayId,
  clearParentDisplayIdCache,
  parentDashboardSerialLabel,
  parentDisplayIdCacheKey,
  pickProfilePublicId,
  readCachedParentDisplayId,
  resolveTrustedParentDisplayId
} from "../lib/public/sequential-display-id";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const dashboardPage = read("app/parent/dashboard/page.tsx");
const dashboardClient = read("components/parent/parent-dashboard-client.tsx");
const displayId = read("lib/public/sequential-display-id.ts");
const logout = read("lib/auth/logout.ts");
const sitterDashboard = read("app/sitter/dashboard/page.tsx");

const eddieId = "parent-eddie";
const bennyId = "parent-benny";

assert.equal(
  pickProfilePublicId({ parent_serial: "P-1002", first_name: "Benny" }, "parent"),
  "P-1002"
);
assert.equal(
  resolveTrustedParentDisplayId({
    userId: bennyId,
    profileSerial: { parent_serial: "P-1002" }
  }),
  "P-1002"
);
assert.equal(parentDashboardSerialLabel("P-1002"), "P-1002");

assert.doesNotMatch(dashboardPage, /parentSerial:\s*"P-1001"/);
assert.doesNotMatch(dashboardPage, /"P-1001"/);
assert.match(dashboardPage, /parentSerial:\s*""/);
assert.match(dashboardClient, /parentDashboardSerialLabel/);
assert.match(dashboardClient, /parentSerialLabel \? \(/);
assert.doesNotMatch(dashboardClient, /\{parentSerial\}/);

assert.equal(parentDashboardSerialLabel(""), null);
assert.equal(parentDashboardSerialLabel(null), null);
assert.equal(parentDashboardSerialLabel("P-1001"), "P-1001");
assert.equal(
  resolveTrustedParentDisplayId({
    userId: bennyId,
    profileSerial: "",
    legacyUnscopedCache: "P-1001"
  }),
  null
);

assert.equal(
  resolveTrustedParentDisplayId({
    userId: bennyId,
    profileSerial: "P-1002",
    scopedCacheValue: "P-1001",
    scopedCacheOwnerId: eddieId,
    legacyUnscopedCache: "P-1001"
  }),
  "P-1002"
);

assert.equal(
  resolveTrustedParentDisplayId({
    userId: bennyId,
    profileSerial: null,
    scopedCacheValue: "P-1001",
    scopedCacheOwnerId: eddieId,
    legacyUnscopedCache: "P-1001"
  }),
  null
);

assert.equal(
  resolveTrustedParentDisplayId({
    userId: bennyId,
    profileSerial: "",
    scopedCacheValue: "P-1001",
    scopedCacheOwnerId: bennyId,
    legacyUnscopedCache: "P-1001"
  }),
  null
);

assert.equal(parentDisplayIdCacheKey(eddieId), `${PARENT_DISPLAY_ID_STORAGE_KEY}:${eddieId}`);
assert.notEqual(parentDisplayIdCacheKey(eddieId), PARENT_DISPLAY_ID_STORAGE_KEY);
assert.notEqual(parentDisplayIdCacheKey(eddieId), parentDisplayIdCacheKey(bennyId));

assert.match(displayId, /never use the legacy unscoped cache/);
assert.match(displayId, /localStorage\.removeItem\(PARENT_DISPLAY_ID_STORAGE_KEY\)/);
assert.match(displayId, /readCachedParentDisplayId\(userId/);
assert.doesNotMatch(
  displayId.slice(displayId.indexOf("export async function fetchProfilePublicId")),
  /if \(expectedRole === "parent"\) \{\s*const cached = readCachedParentDisplayId\(\)/
);

const fetchFn = displayId.slice(displayId.indexOf("export async function fetchProfilePublicId"));
assert.match(fetchFn, /if \(expectedRole === "sitter"\) \{\s*const cached = readCachedSitterDisplayId\(\)/);
assert.match(displayId, new RegExp(SITTER_DISPLAY_ID_STORAGE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(sitterDashboard, /fetchProfilePublicId\(supabase, sitterId, SITTER_ROLE\)/);

assert.match(logout, /clearParentDisplayIdCache/);
assert.match(logout, /clearParentDisplayIdCache\(userId\)/);
assert.match(logout, /await supabase\.auth\.signOut\(\)/);
assert.match(logout, /clearDeviceAuthHints\(\)/);

const memory = new Map<string, string>();
const localStorageMock = {
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  setItem(key: string, value: string) {
    memory.set(key, String(value));
  },
  removeItem(key: string) {
    memory.delete(key);
  }
};
(globalThis as { window: unknown }).window = globalThis;
(globalThis as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;

memory.set(PARENT_DISPLAY_ID_STORAGE_KEY, "P-1001");
cacheParentDisplayId("P-1001", eddieId);
assert.equal(memory.get(PARENT_DISPLAY_ID_STORAGE_KEY), undefined);
assert.equal(memory.get(parentDisplayIdCacheKey(eddieId)), "P-1001");
assert.equal(readCachedParentDisplayId(eddieId), "P-1001");
assert.equal(readCachedParentDisplayId(bennyId), null);
assert.equal(readCachedParentDisplayId(), null);

memory.set(PARENT_DISPLAY_ID_STORAGE_KEY, "P-1001");
clearParentDisplayIdCache(eddieId);
assert.equal(memory.get(PARENT_DISPLAY_ID_STORAGE_KEY), undefined);
assert.equal(memory.get(parentDisplayIdCacheKey(eddieId)), undefined);

console.log("parent-public-id-display: ok");
