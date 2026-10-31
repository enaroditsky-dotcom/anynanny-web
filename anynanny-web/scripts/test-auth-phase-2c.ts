import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE,
  LOGOUT_PUSH_CLEANUP_QUERY,
  LOGOUT_PUSH_CLEANUP_QUERY_VALUE,
  LOGOUT_SIGN_OUT_FAILED_MESSAGE,
  logoutAndRedirect,
  logoutRedirectPath,
  notePushCleanupResult,
  type LogoutSessionClient
} from "../lib/auth/logout";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const CURRENT_ENDPOINT = "https://push.example/device-current";
const OTHER_DEVICE_ENDPOINT = "https://push.example/device-other";

function routerMock(): { router: AppRouterInstance; replaced: string[]; refreshed: number } {
  const replaced: string[] = [];
  let refreshed = 0;
  const router = {
    replace(path: string) {
      replaced.push(path);
    },
    refresh() {
      refreshed += 1;
    }
  } as AppRouterInstance;
  return {
    router,
    replaced,
    get refreshed() {
      return refreshed;
    }
  };
}

function clientMock(options: {
  userId?: string;
  signOut?: () => Promise<{ error: { message?: string } | null }>;
  session?: unknown;
  getSessionError?: unknown;
  getSessionThrows?: boolean;
}): { client: LogoutSessionClient; signOutCalls: number; scopes: string[] } {
  let signOutCalls = 0;
  const scopes: string[] = [];
  const client: LogoutSessionClient = {
    auth: {
      async getUser() {
        return { data: { user: options.userId ? { id: options.userId } : null } };
      },
      async signOut(signOutOptions) {
        signOutCalls += 1;
        scopes.push(signOutOptions?.scope ?? "global");
        if (options.signOut) return options.signOut();
        return { error: null };
      },
      async getSession() {
        if (options.getSessionThrows) throw new Error("offline");
        return { data: { session: options.session ?? null }, error: options.getSessionError };
      }
    }
  };
  return {
    client,
    get signOutCalls() {
      return signOutCalls;
    },
    scopes
  };
}

async function main() {
  assert.doesNotMatch(LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE, /בוטלה/);
  assert.match(LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE, /עדיין רשום/);
  assert.notEqual(LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE, LOGOUT_SIGN_OUT_FAILED_MESSAGE);
  assert.equal(
    logoutRedirectPath("/login?next=/sitter", true),
    `/login?next=%2Fsitter&${LOGOUT_PUSH_CLEANUP_QUERY}=${LOGOUT_PUSH_CLEANUP_QUERY_VALUE}`
  );
  assert.equal(logoutRedirectPath("/login", false), "/login");
  assert.equal(notePushCleanupResult({ ok: true, removed: true }, "logout"), false);
  assert.equal(
    notePushCleanupResult({ ok: false, reason: "server", endpoint: CURRENT_ENDPOINT }, "logout"),
    true
  );

  const successRouter = routerMock();
  const successClient = clientMock({ userId: "parent-1" });
  const success = await logoutAndRedirect(successRouter.router, "/login", {
    releasePush: async () => ({ ok: true, removed: true }),
    getClient: () => successClient.client
  });
  assert.equal(success.ok, true);
  if (success.ok) assert.equal(success.pushCleanupFailed, false);
  assert.equal(successClient.signOutCalls, 1);
  assert.deepEqual(successClient.scopes, ["local"]);
  assert.deepEqual(successRouter.replaced, ["/login"]);
  assert.equal(successRouter.refreshed, 1);

  const failedPushRouter = routerMock();
  const failedPushClient = clientMock({ userId: "sitter-1" });
  let cleanupUserId: string | undefined = "must-not-be-set";
  const failedPush = await logoutAndRedirect(failedPushRouter.router, "/login", {
    releasePush: async () => {
      cleanupUserId = undefined;
      return { ok: false, reason: "server", endpoint: CURRENT_ENDPOINT };
    },
    getClient: () => failedPushClient.client
  });
  assert.equal(failedPush.ok, true);
  if (failedPush.ok) assert.equal(failedPush.pushCleanupFailed, true);
  assert.deepEqual(failedPushClient.scopes, ["local"]);
  assert.equal(cleanupUserId, undefined);
  assert.equal(failedPushClient.signOutCalls, 1);
  assert.deepEqual(failedPushRouter.replaced, [
    `/login?${LOGOUT_PUSH_CLEANUP_QUERY}=${LOGOUT_PUSH_CLEANUP_QUERY_VALUE}`
  ]);
  assert.ok(!failedPushRouter.replaced.join(" ").includes(OTHER_DEVICE_ENDPOINT));

  const offlineRouter = routerMock();
  const offlineClient = clientMock({ userId: "parent-offline" });
  const offline = await logoutAndRedirect(offlineRouter.router, "/login", {
    releasePush: async () => ({ ok: false, reason: "server", endpoint: CURRENT_ENDPOINT }),
    getClient: () => offlineClient.client
  });
  assert.equal(offline.ok, true);
  if (offline.ok) assert.equal(offline.pushCleanupFailed, true);
  assert.equal(offlineClient.signOutCalls, 1);

  const signOutFailRouter = routerMock();
  const signOutFailClient = clientMock({
    userId: "parent-2",
    session: { access_token: "still-present" },
    signOut: async () => ({ error: { message: "network down" } })
  });
  const signOutFail = await logoutAndRedirect(signOutFailRouter.router, "/login", {
    releasePush: async () => ({ ok: true, removed: true }),
    getClient: () => signOutFailClient.client
  });
  assert.deepEqual(signOutFail, { ok: false, reason: "sign_out" });
  assert.deepEqual(signOutFailRouter.replaced, []);

  const thrownRouter = routerMock();
  const thrownClient = clientMock({
    userId: "parent-3",
    session: { access_token: "still-present" },
    signOut: async () => {
      throw new Error("offline");
    }
  });
  const thrown = await logoutAndRedirect(thrownRouter.router, "/login", {
    releasePush: async () => ({ ok: false, reason: "browser", endpoint: CURRENT_ENDPOINT }),
    getClient: () => thrownClient.client
  });
  assert.deepEqual(thrown, { ok: false, reason: "sign_out" });
  assert.deepEqual(thrownRouter.replaced, []);

  const clearedDespiteErrorRouter = routerMock();
  const clearedDespiteErrorClient = clientMock({
    userId: "parent-4",
    session: null,
    signOut: async () => ({ error: { message: "revoke failed after local removal" } })
  });
  const clearedDespiteError = await logoutAndRedirect(clearedDespiteErrorRouter.router, "/login", {
    releasePush: async () => ({ ok: true, removed: false }),
    getClient: () => clearedDespiteErrorClient.client
  });
  assert.equal(clearedDespiteError.ok, true);
  assert.deepEqual(clearedDespiteErrorRouter.replaced, ["/login"]);

  const unknownRouter = routerMock();
  const unknownClient = clientMock({ getSessionThrows: true });
  const unknown = await logoutAndRedirect(unknownRouter.router, "/login", {
    releasePush: async () => ({ ok: true, removed: true }),
    getClient: () => unknownClient.client
  });
  assert.deepEqual(unknown, { ok: false, reason: "sign_out" });
  assert.deepEqual(unknownRouter.replaced, []);

  const noClientRouter = routerMock();
  let noClientCleanup = 0;
  const noClient = await logoutAndRedirect(noClientRouter.router, "/login", {
    releasePush: async () => {
      noClientCleanup += 1;
      return { ok: false, reason: "server", endpoint: CURRENT_ENDPOINT };
    },
    getClient: () => null
  });
  assert.equal(noClientCleanup, 1);
  assert.deepEqual(noClient, { ok: false, reason: "sign_out" });
  assert.deepEqual(noClientRouter.replaced, []);

  let generation = 0;
  let visibleUser: string | null = "sitter-1";
  let releaseInflight = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseInflight = resolve;
  });
  const startedGeneration = generation;
  const inflight = (async () => {
    await gate;
    if (startedGeneration !== generation) return;
    visibleUser = "sitter-1";
  })();
  const retryRouter = routerMock();
  const retryClient = clientMock({
    userId: "sitter-1",
    signOut: async () => {
      generation += 1;
      visibleUser = null;
      releaseInflight();
      return { error: null };
    }
  });
  const duringRetry = await logoutAndRedirect(retryRouter.router, "/login", {
    releasePush: async () => ({ ok: true, removed: true }),
    getClient: () => retryClient.client
  });
  await inflight;
  assert.equal(duringRetry.ok, true);
  assert.equal(visibleUser, null);
  assert.ok(generation > startedGeneration);

  const logout = read("lib/auth/logout.ts");
  const push = read("lib/push/register-push.ts");
  const dashboard = read("components/parent/parent-dashboard-client.tsx");
  const sitterDash = read("app/sitter/dashboard/page.tsx");
  const sitterSettings = read("app/sitter/settings/page.tsx");
  const sitterProfile = read("app/sitter/profile/page.tsx");
  const login = read("app/auth/login/page.tsx");
  const reset = read("app/auth/reset-password/page.tsx");
  const deletion = read("components/account/delete-account-section.tsx");
  const provider = read("components/auth-provider.tsx");

  const deleteOwn = push.slice(push.indexOf("async function deleteOwnPushEndpoint"));
  const deleteOwnBody = deleteOwn.slice(0, deleteOwn.indexOf("export async function enablePushFromUserGesture"));
  assert.match(deleteOwnBody, /\.delete\(\)\.eq\("endpoint", endpoint\)/);
  assert.doesNotMatch(deleteOwnBody, /\.eq\("user_id"/);
  assert.doesNotMatch(deleteOwnBody, /p_user_id/);
  const release = push.slice(push.indexOf("export async function unsubscribeCurrentPushSubscription"));
  const releaseBody = release.slice(0, release.indexOf("export async function alignDevicePushOwnership"));
  assert.match(releaseBody, /deleteOwnPushEndpoint\(endpoint\)/);
  assert.doesNotMatch(releaseBody, /p_user_id/);
  assert.doesNotMatch(logout, /p_user_id|\.delete\(\)|localStorage\.setItem|sessionStorage\.setItem/);
  assert.match(logout, /signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(logout, /scope: "global"/);
  assert.match(reset, /supabase\.auth\.signOut\(\)/);
  assert.doesNotMatch(reset, /scope: "local"/);
  assert.match(deletion, /supabase\.auth\.signOut\(\)/);
  assert.doesNotMatch(deletion, /scope: "local"/);
  assert.match(read("lib/auth/valid-session.ts"), /signOut\(\{ scope: "local" \}\)/);

  assert.match(dashboard, /logoutAndRedirect\(router, "\/login"\)/);
  assert.match(dashboard, /LOGOUT_SIGN_OUT_FAILED_MESSAGE/);
  assert.doesNotMatch(dashboard, /supabase\.auth\.signOut\(\)/);
  for (const source of [sitterDash, sitterSettings, sitterProfile]) {
    assert.match(source, /<LogoutButton/);
    assert.doesNotMatch(source, /supabase\.auth\.signOut\(\)/);
  }

  assert.match(login, /LOGOUT_PUSH_CLEANUP_QUERY_VALUE/);
  assert.match(login, /LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE/);
  assert.match(login, /if \(cancelled \|\| !resolved\.ok\) return;/);

  const resetPush = reset.indexOf("unsubscribeCurrentPushSubscription");
  const resetSuccess = reset.indexOf("setSuccess(true)");
  const resetSignOut = reset.indexOf("supabase.auth.signOut()");
  assert.ok(resetPush >= 0 && resetSuccess > resetPush && resetSignOut > resetSuccess);
  assert.doesNotMatch(reset, /if \(!push\.ok\)/);
  assert.match(reset, /PASSWORD_UPDATED_MESSAGE/);
  assert.match(reset, /window\.location\.replace\(LOGIN_PATH\)/);

  const deletePush = deletion.indexOf("unsubscribeCurrentPushSubscription");
  const deleteAccount = deletion.indexOf("deleteCurrentUserAccount(supabase)");
  const deleteFail = deletion.indexOf("if (!result.ok)");
  const deleteAssign = deletion.indexOf('window.location.assign("/")');
  assert.ok(deletePush >= 0 && deleteAccount > deletePush && deleteFail > deleteAccount && deleteAssign > deleteFail);
  assert.doesNotMatch(deletion, /if \(!push\.ok\)/);
  assert.match(deletion, /setError\(result\.message\)/);
  assert.doesNotMatch(deletion, /setError\(null\);\s*window\.location\.assign/);

  const signedOut = provider.slice(provider.indexOf('event !== "SIGNED_OUT"'));
  assert.match(signedOut, /requestGenRef\.current \+= 1/);
  assert.match(signedOut, /userRef\.current = null/);
  assert.match(signedOut, /noteSettled\(\)/);
  assert.match(signedOut, /setUser\(null\)/);

  console.log("auth-phase-2c: ok");
}

void main();
