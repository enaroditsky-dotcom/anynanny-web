import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMarketingLikeToken,
  parseLikeRequestBody
} from "../lib/marketing/likes";
import { hashMarketingLikeToken } from "../lib/marketing/likes-hash";
import {
  createFileLikeStore,
  createMemoryLikeStore,
  resolveMarketingLikesStoreMode
} from "../lib/marketing/likes-store";
import {
  allowMarketingLikeRequest,
  resetMarketingLikeRateLimit
} from "../lib/marketing/like-rate-limit";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(resolve(root, "app/api/marketing/like/route.ts"), "utf8");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260910140000_marketing_homepage_likes.sql"),
  "utf8"
);

const validToken = "ab".repeat(32);
assert.equal(isMarketingLikeToken(validToken), true);
assert.equal(isMarketingLikeToken("short"), false);
assert.deepEqual(parseLikeRequestBody({ token: validToken }), { ok: true, token: validToken });
assert.equal(parseLikeRequestBody({ token: "nope" }).ok, false);
assert.equal(hashMarketingLikeToken(validToken).length, 64);
assert.notEqual(
  hashMarketingLikeToken(validToken, "pepper"),
  hashMarketingLikeToken(validToken)
);

resetMarketingLikeRateLimit();
assert.equal(allowMarketingLikeRequest("ip-1", 1_000, 2, 1_000), true);
assert.equal(allowMarketingLikeRequest("ip-1", 1_100, 2, 1_000), true);
assert.equal(allowMarketingLikeRequest("ip-1", 1_200, 2, 1_000), false);

assert.equal(resolveMarketingLikesStoreMode({ NODE_ENV: "development" }), "local");
assert.equal(resolveMarketingLikesStoreMode({ NODE_ENV: "production" }), "unconfigured");
assert.equal(
  resolveMarketingLikesStoreMode({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key"
  }),
  "supabase"
);

assert.match(route, /parseLikeRequestBody/);
assert.match(route, /hashMarketingLikeToken/);
assert.match(route, /getMarketingLikeStore/);
assert.match(route, /allowMarketingLikeRequest/);
assert.doesNotMatch(route, /auth\.getUser/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public.marketing_homepage_likes from anon/);
assert.match(migration, /token_hash text primary key/);

async function main() {
  const memory = createMemoryLikeStore();
  assert.equal(await memory.insert("aaa"), "inserted");
  assert.equal(await memory.insert("aaa"), "duplicate");
  const [first, second] = await Promise.all([memory.insert("bbb"), memory.insert("bbb")]);
  assert.equal(new Set([first, second]).has("inserted"), true);
  assert.equal(new Set([first, second]).has("duplicate"), true);

  const dir = await mkdtemp(join(tmpdir(), "anynanny-likes-"));
  const filePath = join(dir, "likes.json");
  const fileStore = await createFileLikeStore(filePath);
  assert.equal(await fileStore.insert("hash-1"), "inserted");
  assert.equal(await fileStore.insert("hash-1"), "duplicate");
  const saved = JSON.parse(await readFile(filePath, "utf8")) as Record<string, string>;
  assert.ok(saved["hash-1"]);

  console.log("test-marketing-likes: PASS");
}

void main();
