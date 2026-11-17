import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "@supabase/supabase-js";
import { ACCOUNT_TYPE_ENTRY_HREF } from "../lib/auth/age-eligibility";
import {
  clearActiveRoleHintWhen,
  LAST_EMAIL_STORAGE_KEY,
  RETURNING_USER_STORAGE_KEY
} from "../lib/auth/returning-user";
import { resolveValidAuthUser } from "../lib/auth/valid-session";
import { loginRegistrationHref, welcomeSignupHref } from "../lib/charter/routing";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    }
  }
});

function seedHints() {
  store.clear();
  store.set("active_role", "parent");
  store.set(LAST_EMAIL_STORAGE_KEY, "parent@example.com");
  store.set(RETURNING_USER_STORAGE_KEY, "true");
}

const user = { id: "user-1", email: "parent@example.com" } as User;
const session = { access_token: "access-token" };

function mockClient(opts: {
  user?: User | null;
  error?: unknown;
  session?: { access_token: string } | null;
  signOut?: () => Promise<unknown>;
  signOutCalls: Array<string | undefined>;
}) {
  let currentSession = opts.session ?? null;
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: opts.error ?? null }),
      getSession: async () => ({ data: { session: currentSession } }),
      signOut: async (options?: { scope?: string }) => {
        opts.signOutCalls.push(options?.scope);
        if (opts.signOut) return opts.signOut();
        currentSession = null;
        return { error: null };
      }
    }
  };
}

function nextParam(href: string): string | null {
  return new URL(href, "https://anynanny.local").searchParams.get("next");
}

async function main() {
  assert.equal(loginRegistrationHref("parent", null), welcomeSignupHref("parent"));
  assert.equal(nextParam(loginRegistrationHref("parent", "babysitter")), "/register?role=parent");
  assert.equal(nextParam(loginRegistrationHref("sitter", null)), "/register?role=sitter&track=babysitter");
  assert.equal(nextParam(loginRegistrationHref("sitter", "babysitter")), "/register?role=sitter&track=babysitter");
  assert.equal(nextParam(loginRegistrationHref("sitter", "Expert")), "/register?role=sitter&track=expert");
  assert.equal(loginRegistrationHref(null, null), ACCOUNT_TYPE_ENTRY_HREF);
  assert.equal(loginRegistrationHref("admin", "expert"), ACCOUNT_TYPE_ENTRY_HREF);
  assert.equal(ACCOUNT_TYPE_ENTRY_HREF, "/?manual=true");

  const login = read("app/auth/login/page.tsx");
  assert.match(login, /אין לכם חשבון\? הירשמו עכשיו/);
  assert.match(login, /loginRegistrationHref\(roleFromQuery, trackFromQuery\)/);
  assert.match(login, /שכחת סיסמה\?/);
  assert.doesNotMatch(login, /href="\/register/);
  assert.doesNotMatch(login, /href="\/auth\/sign-up/);

  seedHints();
  clearActiveRoleHintWhen(false);
  assert.equal(store.get("active_role"), "parent");
  assert.equal(store.get(LAST_EMAIL_STORAGE_KEY), "parent@example.com");
  assert.equal(store.get(RETURNING_USER_STORAGE_KEY), "true");
  clearActiveRoleHintWhen(true);
  assert.equal(store.has("active_role"), false);
  assert.equal(store.get(LAST_EMAIL_STORAGE_KEY), "parent@example.com");
  assert.equal(store.get(RETURNING_USER_STORAGE_KEY), "true");

  const reset = read("app/auth/reset-password/page.tsx");
  const resetSignOut = reset.indexOf("await supabase.auth.signOut()");
  const resetClear = reset.indexOf("clearActiveRoleHintWhen(!signOutError)");
  const resetCatch = reset.indexOf("[password-reset] signOut after update");
  const resetNav = reset.indexOf("window.location.replace(LOGIN_PATH)");
  assert.ok(resetSignOut >= 0 && resetClear > resetSignOut && resetCatch > resetClear && resetNav > resetCatch);
  assert.match(reset, /await supabase\.auth\.signOut\(\)/);
  assert.doesNotMatch(reset, /scope:\s*"local"/);
  assert.doesNotMatch(reset, /clearDeviceAuthHints\(\)/);

  seedHints();
  const networkCalls: Array<string | undefined> = [];
  const network = await resolveValidAuthUser(
    mockClient({
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 },
      session,
      signOutCalls: networkCalls
    })
  );
  assert.equal(network.ok, false);
  if (!network.ok) assert.equal(network.reason, "unavailable");
  assert.equal(networkCalls.length, 0);
  assert.equal(store.get("active_role"), "parent");

  seedHints();
  const verifiedCalls: Array<string | undefined> = [];
  const verified = await resolveValidAuthUser(
    mockClient({ user, session, signOutCalls: verifiedCalls })
  );
  assert.equal(verified.ok, true);
  assert.equal(verifiedCalls.length, 0);
  assert.equal(store.get("active_role"), "parent");

  seedHints();
  const revokedCalls: Array<string | undefined> = [];
  const revoked = await resolveValidAuthUser(
    mockClient({
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" },
      session,
      signOutCalls: revokedCalls
    })
  );
  assert.equal(revoked.ok, false);
  if (!revoked.ok) {
    assert.equal(revoked.reason, "invalid_session");
    assert.equal(revoked.clearedStaleSession, true);
  }
  assert.deepEqual(revokedCalls, ["local"]);
  assert.equal(store.has("active_role"), false);
  assert.equal(store.get(LAST_EMAIL_STORAGE_KEY), "parent@example.com");
  assert.equal(store.get(RETURNING_USER_STORAGE_KEY), "true");

  seedHints();
  const failedCalls: Array<string | undefined> = [];
  const failed = await resolveValidAuthUser(
    mockClient({
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" },
      session,
      signOutCalls: failedCalls,
      signOut: async () => ({ error: { message: "network down" } })
    })
  );
  assert.equal(failed.ok, false);
  assert.deepEqual(failedCalls, ["local"]);
  assert.equal(store.get("active_role"), "parent");

  seedHints();
  const thrownCalls: Array<string | undefined> = [];
  await resolveValidAuthUser(
    mockClient({
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" },
      session,
      signOutCalls: thrownCalls,
      signOut: async () => {
        throw new Error("offline");
      }
    })
  );
  assert.equal(store.get("active_role"), "parent");

  seedHints();
  const remainingCalls: Array<string | undefined> = [];
  await resolveValidAuthUser(
    mockClient({
      error: { code: "session_not_found", message: "Session not found" },
      session,
      signOutCalls: remainingCalls,
      signOut: async () => ({ error: null })
    })
  );
  assert.deepEqual(remainingCalls, ["local"]);
  assert.equal(store.get("active_role"), "parent");

  console.log("auth-entry-completion: ok");
}

void main();
