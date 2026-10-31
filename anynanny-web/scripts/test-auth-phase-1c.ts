import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "@supabase/supabase-js";
import {
  AUTH_TRANSIENT_RETRY_LIMIT,
  authRetryDelayMs,
  createAuthRetryScheduler,
  roleDashboardHref
} from "../lib/auth/auth-retry";
import { protectedScreenGate, resolveValidAuthUser } from "../lib/auth/valid-session";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const user = { id: "user-1", email: "parent@example.com" } as User;
const session = { access_token: "access-token", user: { id: user.id } };

function mockClient(opts: {
  user?: User | null;
  error?: unknown;
  session?: { access_token: string } | null;
  signOutCalls: string[];
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: opts.error ?? null }),
      getSession: async () => ({ data: { session: opts.session ?? null } }),
      signOut: async (options?: { scope?: string }) => {
        opts.signOutCalls.push(options?.scope ?? "default");
      }
    }
  };
}

function fakeScheduler() {
  const timers: Array<{ id: number; delay: number; fn: () => void }> = [];
  let nextId = 1;
  let retries = 0;
  let exhausted = 0;
  const scheduler = createAuthRetryScheduler({
    setTimer(delay, fn) {
      const id = nextId++;
      timers.push({ id, delay, fn });
      return id;
    },
    clearTimer(id) {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    onRetry() {
      retries += 1;
    },
    onExhausted() {
      exhausted += 1;
    }
  });
  return {
    scheduler,
    timers,
    retries: () => retries,
    exhausted: () => exhausted
  };
}

async function main() {
  const networkCalls: string[] = [];
  const network = protectedScreenGate(
    await resolveValidAuthUser(
      mockClient({
        error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 },
        session,
        signOutCalls: networkCalls
      })
    )
  );
  assert.equal(network.status, "unavailable");
  assert.equal("user" in network, false);
  assert.equal(networkCalls.length, 0);

  const signedOut = protectedScreenGate(
    await resolveValidAuthUser(mockClient({ user: null, session: null, signOutCalls: [] }))
  );
  assert.equal(signedOut.status, "signed_out");

  const revokedCalls: string[] = [];
  const revoked = protectedScreenGate(
    await resolveValidAuthUser(
      mockClient({
        error: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" },
        session,
        signOutCalls: revokedCalls
      })
    )
  );
  assert.equal(revoked.status, "signed_out");
  assert.deepEqual(revokedCalls, ["local"]);

  const recovered = protectedScreenGate(
    await resolveValidAuthUser(mockClient({ user, session, signOutCalls: [] }))
  );
  assert.equal(recovered.status, "verified");
  if (recovered.status === "verified") assert.equal(recovered.user.id, user.id);

  const second = read("app/auth/second-role/page.tsx");
  assert.match(second, /resolveValidAuthUser/);
  assert.match(second, /protectedScreenGate/);
  assert.doesNotMatch(second, /auth\.getUser\(/);
  assert.ok(second.indexOf('gate.status === "unavailable"') < second.indexOf("markSecondRoleInProgress(user.id, role)"));
  assert.ok(second.indexOf("const user = gate.user") < second.indexOf("markSecondRoleInProgress(user.id, role)"));
  assert.ok(second.indexOf('gate.status === "unavailable"') < second.indexOf("await loadProductProfileOwnership"));
  assert.match(second, /noteUnavailable/);
  assert.match(second, /נסו שוב/);
  assert.match(second, /secondRoleLoginHref/);

  assert.equal(roleDashboardHref("parent", null), null);
  assert.equal(roleDashboardHref("sitter", null), null);
  assert.equal(roleDashboardHref("parent", ""), null);
  assert.equal(roleDashboardHref("other", user.id), null);
  assert.equal(roleDashboardHref("parent", user.id), "/parent/dashboard");
  assert.equal(roleDashboardHref("sitter", user.id), "/sitter/dashboard");

  const home = read("app/page.tsx");
  const missingBranch = home.slice(home.indexOf("if (!supabase)"), home.indexOf("const gate = protectedScreenGate"));
  assert.doesNotMatch(missingBranch, /dashboard/);
  assert.doesNotMatch(missingBranch, /router\.replace/);
  assert.match(missingBranch, /setServiceMissing\(true\)/);
  assert.match(home, /AUTH_SERVICE_UNAVAILABLE_MESSAGE/);
  assert.match(home, /noteUnavailable/);
  assert.ok(home.indexOf('gate.status === "unavailable"') < home.indexOf("const ownership = await loadProductProfileOwnership"));

  const sitterHome = read("app/sitter/page.tsx");
  assert.doesNotMatch(sitterHome, /redirect\(SITTER_DASHBOARD_PATH\)/);
  assert.ok(sitterHome.indexOf('gate.status === "unavailable"') < sitterHome.indexOf("await loadProductProfileOwnership"));
  assert.match(sitterHome, /AUTH_SERVICE_UNAVAILABLE_MESSAGE/);
  assert.doesNotMatch(sitterHome.slice(0, sitterHome.indexOf("const user = gate.user")), /ParentDashboardClient|initialProfiles/);

  const parentDash = read("app/parent/dashboard/page.tsx");
  const beforeParentId = parentDash.slice(parentDash.indexOf("export default"), parentDash.indexOf("const parentId"));
  assert.doesNotMatch(beforeParentId, /<ParentDashboardClient/);
  assert.match(beforeParentId, /gate.status === "unavailable"/);
  assert.match(beforeParentId, /AUTH_SERVICE_UNAVAILABLE_MESSAGE/);

  assert.deepEqual(
    Array.from({ length: AUTH_TRANSIENT_RETRY_LIMIT }, (_, index) => authRetryDelayMs(index + 1)),
    [1000, 2000, 4000, 8000]
  );

  const onlineStaysTrue = fakeScheduler();
  const delays: number[] = [];
  for (let attempt = 0; attempt < AUTH_TRANSIENT_RETRY_LIMIT; attempt += 1) {
    const planned = onlineStaysTrue.scheduler.noteUnavailable();
    assert.equal(planned.scheduled, true);
    assert.equal(planned.exhausted, false);
    delays.push(planned.delayMs ?? 0);
    const pending = onlineStaysTrue.timers.shift();
    assert.ok(pending);
    pending.fn();
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
  assert.equal(onlineStaysTrue.retries(), AUTH_TRANSIENT_RETRY_LIMIT);
  const stopped = onlineStaysTrue.scheduler.noteUnavailable();
  assert.equal(stopped.scheduled, false);
  assert.equal(stopped.exhausted, true);
  assert.equal(onlineStaysTrue.exhausted(), 1);
  assert.equal(onlineStaysTrue.timers.length, 0);

  onlineStaysTrue.scheduler.retryNow();
  const manual = onlineStaysTrue.scheduler.noteUnavailable();
  assert.equal(manual.scheduled, true);
  assert.equal(manual.delayMs, 1000);

  const unmount = fakeScheduler();
  const scheduled = unmount.scheduler.noteUnavailable();
  assert.equal(scheduled.scheduled, true);
  const pending = unmount.timers[0];
  assert.ok(pending);
  unmount.scheduler.dispose();
  assert.equal(unmount.timers.length, 0);
  pending.fn();
  assert.equal(unmount.retries(), 0);
  const afterDispose = unmount.scheduler.noteUnavailable();
  assert.equal(afterDispose.scheduled, false);

  const retrySource = read("lib/auth/auth-retry.ts");
  const hookSource = read("lib/auth/use-online-retry-nonce.tsx");
  const provider = read("components/auth-provider.tsx");
  assert.doesNotMatch(retrySource, /navigator/);
  assert.match(hookSource, /dispose\(\)/);
  assert.match(hookSource, /retryNow/);
  assert.match(hookSource, /נסו שוב/);
  assert.match(provider, /noteUnavailable/);
  assert.match(provider, /retryAuthentication/);
  assert.match(provider, /createAuthRetryScheduler/);
  assert.doesNotMatch(provider, /TRANSIENT_AUTH_RETRY_MS/);

  const login = read("app/auth/login/page.tsx");
  assert.match(login, /planAuthRetry/);
  assert.match(login, /if \(cancelled \|\| !resolved\.ok\) return;/);
  assert.match(login, /נסו שוב/);

  console.log("auth-phase-1c: ok");
}

void main();
