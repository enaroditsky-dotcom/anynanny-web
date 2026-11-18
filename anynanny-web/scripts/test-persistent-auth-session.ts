import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "@supabase/supabase-js";
import {
  canHonorAuthNextParam,
  isServerVerifiedAuthUser,
  isTransientAuthFailure,
  resolveValidAuthUser,
  retainedUserAfterAuthResolution,
  shouldClearStaleSession
} from "../lib/auth/valid-session";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const user = { id: "user-1", email: "parent@example.com" } as User;
const session = { access_token: "access-token", user: { id: user.id } };

function mockClient(opts: {
  user?: User | null;
  error?: unknown;
  session?: { access_token: string; user?: { id?: string } } | null;
  signOutCalls: Array<string | undefined>;
  getUser?: () => Promise<{ data: { user: User | null }; error: unknown }>;
}) {
  return {
    auth: {
      getUser:
        opts.getUser ??
        (async () => ({ data: { user: opts.user ?? null }, error: opts.error ?? null })),
      getSession: async () => ({ data: { session: opts.session ?? null } }),
      signOut: async (options?: { scope?: string }) => {
        opts.signOutCalls.push(options?.scope);
      }
    }
  };
}

async function main() {
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
  assert.equal(network.clearedStaleSession, false);
  assert.equal(networkCalls.length, 0);
  assert.equal(isServerVerifiedAuthUser(network), false);
  assert.equal(canHonorAuthNextParam(network.ok), false);
  assert.equal(retainedUserAfterAuthResolution(user, network)?.id, user.id);
  assert.equal(retainedUserAfterAuthResolution(null, network), null);

  const temporaryCalls: Array<string | undefined> = [];
  const temporary = await resolveValidAuthUser(
    mockClient({
      error: { status: 503, message: "Service Unavailable" },
      session,
      signOutCalls: temporaryCalls
    })
  );
  assert.equal(temporary.ok, false);
  if (!temporary.ok) assert.equal(temporary.reason, "unavailable");
  assert.equal(temporaryCalls.length, 0);
  assert.equal(shouldClearStaleSession({ user: null, error: { status: 503, message: "Service Unavailable" }, hasLocalSession: true }), false);
  assert.equal(isTransientAuthFailure({ status: 503, message: "Service Unavailable" }), true);

  const thrownCalls: Array<string | undefined> = [];
  const thrown = await resolveValidAuthUser(
    mockClient({
      session,
      signOutCalls: thrownCalls,
      getUser: async () => {
        throw new TypeError("Failed to fetch");
      }
    })
  );
  assert.equal(thrown.ok, false);
  if (!thrown.ok) assert.equal(thrown.reason, "unavailable");
  assert.equal(thrownCalls.length, 0);

  const forbiddenCalls: Array<string | undefined> = [];
  const forbidden = await resolveValidAuthUser(
    mockClient({
      error: { status: 403, message: "Forbidden" },
      session,
      signOutCalls: forbiddenCalls
    })
  );
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.reason, "unavailable");
  assert.equal(forbiddenCalls.length, 0);

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
  assert.equal(retainedUserAfterAuthResolution(user, revoked), null);
  assert.equal(isServerVerifiedAuthUser(revoked), false);

  const bannedCalls: Array<string | undefined> = [];
  const banned = await resolveValidAuthUser(
    mockClient({
      error: { code: "user_banned", message: "User is banned" },
      session,
      signOutCalls: bannedCalls
    })
  );
  assert.equal(banned.clearedStaleSession, true);
  assert.deepEqual(bannedCalls, ["local"]);

  let getUserAttempts = 0;
  const refreshCalls: Array<string | undefined> = [];
  const refreshing = mockClient({
    session,
    signOutCalls: refreshCalls,
    getUser: async () => {
      getUserAttempts += 1;
      if (getUserAttempts === 1) {
        return { data: { user: null }, error: { code: "bad_jwt", message: "JWT expired" } };
      }
      return { data: { user }, error: null };
    }
  });
  const expired = await resolveValidAuthUser(refreshing);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, "unavailable");
  assert.equal(expired.clearedStaleSession, false);
  assert.equal(refreshCalls.length, 0);
  const refreshed = await resolveValidAuthUser(refreshing);
  assert.equal(refreshed.ok, true);
  if (refreshed.ok) assert.equal(refreshed.user.id, user.id);
  assert.equal(refreshCalls.length, 0);
  assert.equal(isServerVerifiedAuthUser(refreshed), true);

  const duringNavigation = retainedUserAfterAuthResolution(user, temporary);
  assert.equal(duringNavigation?.id, user.id);
  const stillThere = retainedUserAfterAuthResolution(duringNavigation, network);
  assert.equal(stillThere?.id, user.id);

  const loggedOut = await resolveValidAuthUser(
    mockClient({ user: null, session: null, signOutCalls: [] })
  );
  assert.equal(loggedOut.ok, false);
  if (!loggedOut.ok) assert.equal(loggedOut.reason, "signed_out");
  assert.equal(loggedOut.clearedStaleSession, false);
  assert.equal(retainedUserAfterAuthResolution(user, loggedOut), null);

  const clientSource = read("lib/supabase/client.ts");
  const providerSource = read("components/auth-provider.tsx");
  const logoutSource = read("lib/auth/logout.ts");
  const roleSelection = read("app/auth/role-selection/page.tsx");
  const login = read("app/auth/login/page.tsx");
  const validSession = read("lib/auth/valid-session.ts");

  assert.doesNotMatch(clientSource, /autoRefreshToken:\s*false/);
  assert.doesNotMatch(clientSource, /persistSession:\s*false/);
  assert.doesNotMatch(validSession, /refreshSession\(/);
  assert.doesNotMatch(providerSource, /signOut\(/);
  assert.match(providerSource, /retainedUserAfterAuthResolution/);
  assert.match(providerSource, /addEventListener\("online"/);
  assert.match(login, /if \(cancelled \|\| !resolved\.ok\) return;/);
  assert.match(login, /addEventListener\("online"/);
  assert.match(logoutSource, /unsubscribeCurrentPushSubscription/);
  assert.match(logoutSource, /await supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(logoutSource, /scope: "global"/);
  const unsubAt = logoutSource.indexOf("unsubscribeCurrentPushSubscription");
  const signOutAt = logoutSource.indexOf('await supabase.auth.signOut({ scope: "local" })');
  assert.ok(unsubAt >= 0 && signOutAt > unsubAt);
  assert.doesNotMatch(logoutSource, /retainedUserAfterAuthResolution|shouldClearStaleSession/);

  const unavailableAt = roleSelection.indexOf('resolved.reason === "unavailable"');
  const replaceAt = roleSelection.indexOf("router.replace(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT)");
  assert.ok(unavailableAt >= 0 && replaceAt > unavailableAt);

  console.log("persistent-auth-session: ok");
}

void main();
