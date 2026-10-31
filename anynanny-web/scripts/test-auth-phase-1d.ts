import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "@supabase/supabase-js";
import { resolveBrowserAuth } from "../lib/supabase/browser-auth";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const user = { id: "user-1", email: "parent@example.com" } as User;
const session = { access_token: "access-token", user: { id: "cached-session-user" } };

function mockClient(opts: {
  user?: User | null;
  error?: unknown;
  session?: { access_token: string; user?: { id?: string } } | null;
  signOutCalls: Array<string | undefined>;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: opts.error ?? null }),
      getSession: async () => ({ data: { session: opts.session ?? null } }),
      signOut: async (options?: { scope?: string }) => {
        opts.signOutCalls.push(options?.scope);
      }
    }
  };
}

async function main() {
  const networkCalls: Array<string | undefined> = [];
  const network = await resolveBrowserAuth(
    mockClient({
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 },
      session,
      signOutCalls: networkCalls
    })
  );
  assert.equal(network.ok, false);
  if (!network.ok) assert.equal(network.reason, "unavailable");
  assert.equal(networkCalls.length, 0);

  const verifiedCalls: Array<string | undefined> = [];
  const verified = await resolveBrowserAuth(
    mockClient({ user, session, signOutCalls: verifiedCalls })
  );
  assert.equal(verified.ok, true);
  if (verified.ok) assert.equal(verified.userId, user.id);
  assert.equal(verifiedCalls.length, 0);

  const signedOutCalls: Array<string | undefined> = [];
  const signedOut = await resolveBrowserAuth(
    mockClient({ user: null, session: null, signOutCalls: signedOutCalls })
  );
  assert.equal(signedOut.ok, false);
  if (!signedOut.ok) assert.equal(signedOut.reason, "signed_out");
  assert.equal(signedOutCalls.length, 0);

  const revokedCalls: Array<string | undefined> = [];
  const revoked = await resolveBrowserAuth(
    mockClient({
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" },
      session,
      signOutCalls: revokedCalls
    })
  );
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.equal(revoked.reason, "invalid_session");
  assert.deepEqual(revokedCalls, ["local"]);

  const browserAuth = read("lib/supabase/browser-auth.ts");
  assert.match(browserAuth, /resolveValidAuthUser\(supabase\)/);
  assert.doesNotMatch(browserAuth, /fromSession|auth\.getSession\(/);

  const billing = read("lib/billing/use-parent-billing-session.ts");
  assert.doesNotMatch(billing, /fromSession|authData\.user \?\?/);
  assert.match(billing, /if \(!auth\.ok\)/);

  const logout = read("lib/auth/logout.ts");
  const unsubscribeAt = logout.indexOf("unsubscribeCurrentPushSubscription");
  const signOutAt = logout.indexOf('supabase.auth.signOut({ scope: "local" })');
  const markerAt = logout.indexOf("clearNewBookingMarker()");
  assert.ok(unsubscribeAt >= 0 && signOutAt > unsubscribeAt && markerAt > signOutAt);

  const provider = read("components/auth-provider.tsx");
  const signedOutHandler = provider.slice(provider.indexOf('event !== "SIGNED_OUT"'));
  assert.match(signedOutHandler, /requestGenRef\.current \+= 1/);
  assert.match(signedOutHandler, /userRef\.current = null/);
  assert.match(signedOutHandler, /noteSettled\(\)/);
  assert.match(signedOutHandler, /clearNewBookingMarker\(\)/);
  assert.match(signedOutHandler, /setUser\(null\)/);

  const dashboardPage = read("app/parent/dashboard/page.tsx");
  const unavailableAt = dashboardPage.indexOf('gate.status === "unavailable"');
  const redirectAt = dashboardPage.indexOf('redirect("/auth/login?next=/parent/dashboard")');
  const clientAt = dashboardPage.indexOf("<ParentDashboardClient");
  assert.ok(unavailableAt >= 0 && redirectAt > unavailableAt && clientAt > redirectAt);

  const dashboardClient = read("components/parent/parent-dashboard-client.tsx");
  const authEffect = dashboardClient.slice(dashboardClient.indexOf("const expectedId = authUser.id"));
  const guardAt = authEffect.indexOf("if (cancelled || accountUserIdRef.current !== expectedId) return;");
  const setParentAt = authEffect.indexOf("setParentId(auth.userId)");
  assert.ok(guardAt >= 0 && setParentAt > guardAt);
  assert.match(dashboardClient, /logoutAndRedirect\(router, "\/login"\)/);
  assert.doesNotMatch(dashboardClient, /supabase\.auth\.signOut\(\)/);
  assert.match(dashboardClient, /if \(auth\.reason === "unavailable"\) return/);

  console.log("auth-phase-1d: ok");
}

void main();
