import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteCurrentUserAccount } from "../lib/account/delete-current-user";
import {
  AVATARS_BUCKET,
  removeAuthenticatedUserAvatars
} from "../lib/profile/avatar-storage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

type ListRow = { name: string; id?: string | null };
type MockOptions = {
  userId?: string | null;
  authError?: string | null;
  list?: ListRow[] | null;
  listError?: string | null;
  removeError?: string | null;
  rpcError?: string | null;
};

function createMock(options: MockOptions = {}) {
  const order: string[] = [];
  const listedPrefixes: string[] = [];
  const removedPaths: string[][] = [];
  const rpcCalls: Array<{ name: string; args: unknown[] }> = [];
  const buckets: string[] = [];

  const client = {
    auth: {
      async getUser() {
        order.push("getUser");
        if (options.authError) {
          return { data: { user: null }, error: { message: options.authError } };
        }
        if (!options.userId) {
          return { data: { user: null }, error: null };
        }
        return { data: { user: { id: options.userId } }, error: null };
      }
    },
    storage: {
      from(bucket: string) {
        buckets.push(bucket);
        return {
          async list(prefix: string) {
            order.push("list");
            listedPrefixes.push(prefix);
            if (options.listError) {
              return { data: null, error: { message: options.listError } };
            }
            return { data: options.list ?? [], error: null };
          },
          async remove(paths: string[]) {
            order.push("remove");
            removedPaths.push(paths);
            if (options.removeError) {
              return { data: null, error: { message: options.removeError } };
            }
            return { data: [], error: null };
          }
        };
      }
    },
    async rpc(name: string, ...args: unknown[]) {
      order.push("rpc");
      rpcCalls.push({ name, args });
      if (options.rpcError) {
        return { data: null, error: { message: options.rpcError } };
      }
      return { data: null, error: null };
    }
  };

  return {
    client: client as unknown as SupabaseClient,
    order,
    listedPrefixes,
    removedPaths,
    rpcCalls,
    buckets
  };
}

const helperSource = read("lib/profile/avatar-storage.ts");
const deleteSource = read("lib/account/delete-current-user.ts");
const uiSource = read("components/account/delete-account-section.tsx");

assert.match(helperSource, /export async function removeAuthenticatedUserAvatars\(\s*supabase: SupabaseClient\s*\)/);
assert.doesNotMatch(
  helperSource.slice(helperSource.indexOf("export async function removeAuthenticatedUserAvatars")),
  /userId:\s*string/
);
assert.match(helperSource, /supabase\.auth\.getUser\(\)/);
assert.match(helperSource, /\.list\(userId\)/);
assert.match(helperSource, /\.remove\(paths\)/);
assert.doesNotMatch(helperSource, /from\(["']storage\.objects["']\)/);
assert.doesNotMatch(helperSource, /service_role/);
assert.doesNotMatch(deleteSource, /service_role/);
assert.match(deleteSource, /removeAuthenticatedUserAvatars\(supabase\)/);
assert.match(deleteSource, /supabase\.rpc\("delete_current_user"\)/);
assert.doesNotMatch(deleteSource, /rpc\("delete_current_user",/);
assert.match(uiSource, /deleteCurrentUserAccount\(supabase\)/);

async function main() {
  const empty = createMock({ userId: USER_ID, list: [] });
  const emptyResult = await removeAuthenticatedUserAvatars(empty.client);
  assert.equal(emptyResult.error, null);
  assert.deepEqual(empty.listedPrefixes, [USER_ID]);
  assert.deepEqual(empty.removedPaths, []);
  assert.deepEqual(empty.buckets, [AVATARS_BUCKET]);

  const fromAuth = createMock({ userId: USER_ID, list: [{ name: "avatar" }] });
  await removeAuthenticatedUserAvatars(fromAuth.client);
  assert.deepEqual(fromAuth.listedPrefixes, [USER_ID]);
  assert.ok(!fromAuth.listedPrefixes.includes(OTHER_ID));
  assert.equal(removeAuthenticatedUserAvatars.length, 1);

  const variants = createMock({
    userId: USER_ID,
    list: [
      { name: "avatar" },
      { name: "avatar.jpg" },
      { name: "avatar.jpeg" },
      { name: "avatar.png" },
      { name: "avatar.webp" }
    ]
  });
  const variantsResult = await removeAuthenticatedUserAvatars(variants.client);
  assert.equal(variantsResult.error, null);
  assert.deepEqual(variants.listedPrefixes, [USER_ID]);
  assert.deepEqual(variants.removedPaths, [
    [
      `${USER_ID}/avatar`,
      `${USER_ID}/avatar.jpg`,
      `${USER_ID}/avatar.jpeg`,
      `${USER_ID}/avatar.png`,
      `${USER_ID}/avatar.webp`
    ]
  ]);
  assert.ok(!variants.listedPrefixes.includes(OTHER_ID));
  assert.ok(variants.removedPaths.flat().every((path) => path.startsWith(`${USER_ID}/`)));
  assert.ok(!variants.removedPaths.flat().some((path) => path.includes(OTHER_ID)));

  const traversal = createMock({
    userId: USER_ID,
    list: [{ name: "avatar.png" }, { name: `../${OTHER_ID}/avatar` }, { name: `${OTHER_ID}/avatar` }]
  });
  const traversalResult = await removeAuthenticatedUserAvatars(traversal.client);
  assert.equal(traversalResult.error, null);
  assert.deepEqual(traversal.removedPaths, [[`${USER_ID}/avatar.png`]]);

  const listFailThenDelete = createMock({
    userId: USER_ID,
    listError: "list denied",
    rpcError: null
  });
  const listFailResult = await deleteCurrentUserAccount(listFailThenDelete.client);
  assert.equal(listFailResult.ok, true);
  assert.deepEqual(listFailThenDelete.rpcCalls, [{ name: "delete_current_user", args: [] }]);
  assert.ok(listFailThenDelete.order.indexOf("list") < listFailThenDelete.order.indexOf("rpc"));
  assert.ok(!listFailThenDelete.order.includes("remove"));

  const removeFailThenDelete = createMock({
    userId: USER_ID,
    list: [{ name: "avatar.jpg" }],
    removeError: "remove denied"
  });
  const removeFailResult = await deleteCurrentUserAccount(removeFailThenDelete.client);
  assert.equal(removeFailResult.ok, true);
  assert.deepEqual(removeFailThenDelete.rpcCalls, [{ name: "delete_current_user", args: [] }]);
  assert.ok(removeFailThenDelete.order.indexOf("remove") < removeFailThenDelete.order.indexOf("rpc"));

  const happy = createMock({
    userId: USER_ID,
    list: [{ name: "avatar" }, { name: "avatar.png" }]
  });
  const happyResult = await deleteCurrentUserAccount(happy.client);
  assert.equal(happyResult.ok, true);
  assert.deepEqual(happy.order.filter((step) => step !== "getUser"), ["list", "remove", "rpc"]);
  assert.deepEqual(happy.rpcCalls, [{ name: "delete_current_user", args: [] }]);

  console.log("Delete-account avatar cleanup checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
