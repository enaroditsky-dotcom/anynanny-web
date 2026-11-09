import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "@supabase/supabase-js";
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

function assertWaitsBeforeLogin(source: string, loginSnippet: string) {
  const unavailableAt = source.includes('result.status === "unavailable"')
    ? source.indexOf('result.status === "unavailable"')
    : source.indexOf('gate.status === "unavailable"');
  const loginAt = source.indexOf(loginSnippet);
  assert.ok(unavailableAt >= 0, "missing unavailable gate");
  assert.ok(loginAt > unavailableAt, `login redirect is not after the unavailable wait: ${loginSnippet}`);
  assert.match(source, /resolveValidAuthUser/);
  assert.match(source, /useOnlineRetryNonce/);
  assert.doesNotMatch(source, /auth\.getUser\(/);
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
  assert.equal("user" in signedOut, false);

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
  assert.notEqual(network.status, "verified");

  const screens: Array<[string, string]> = [
    ["app/parent/calendar/page.tsx", 'router.replace("/auth/login?next=/parent/calendar")'],
    ["app/sitter/profile/page.tsx", 'router.replace("/auth/login?next=/sitter/profile")'],
    ["components/parent/parent-personal-area.tsx", 'router.replace("/auth/login?next=/parent/profile")'],
    ["components/charter/charter-flow-page.tsx", "router.replace(`/auth/login?next=/charter"],
    ["components/welcome/welcome-flow-page.tsx", 'router.replace(`${login.pathname}${login.search}`)']
  ];
  for (const [file, loginSnippet] of screens) {
    assertWaitsBeforeLogin(read(file), loginSnippet);
  }

  const calendar = read("app/parent/calendar/page.tsx");
  assert.ok(calendar.indexOf('gate.status === "unavailable"') < calendar.indexOf("setParentId(user.id)"));
  const profile = read("app/sitter/profile/page.tsx");
  assert.ok(profile.indexOf('gate.status === "unavailable"') < profile.indexOf("setUserId(user.id)"));
  assert.match(profile, /authReady \? \([\s\S]*<SitterPersonalArea/);
  const personal = read("components/parent/parent-personal-area.tsx");
  assert.ok(personal.indexOf('gate.status === "unavailable"') < personal.indexOf("setForm(parsed)"));
  const home = read("components/home/application-home-page.tsx");
  const restore = read("lib/auth/home-session-restore.ts");
  assert.match(home, /restorePending/);
  assert.match(home, /useOnlineRetryNonce/);
  assert.match(home, /searchParams\.get\("manual"\) === "true"/);
  assert.ok(home.indexOf('searchParams.get("manual") === "true"') < home.indexOf("await restoreHomeSession"));
  assert.ok(home.indexOf('result.status === "unavailable"') < home.indexOf('result.role === "parent" ? "/login?role=parent"'));
  assert.ok(home.indexOf('result.status === "unavailable"') < home.indexOf("router.replace(result.href)"));
  assert.doesNotMatch(home, /auth\.getUser\(/);
  assert.doesNotMatch(home, /signOut\(/);
  assert.match(restore, /resolveValidAuthUser/);
  assert.ok(restore.indexOf('gate.status === "unavailable"') < restore.indexOf("await resolvePostAuthPath"));
  assert.doesNotMatch(restore, /signOut\(/);
  assert.doesNotMatch(home, /if \(activeRole === "parent" \|\| activeRole === "sitter"\)/);

  console.log("protected-screen-auth-gate: ok");
}

void main();
