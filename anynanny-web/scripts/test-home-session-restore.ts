import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "@supabase/supabase-js";
import { activeRoleForRestoredPath, restoreHomeSession } from "../lib/auth/home-session-restore";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const parent = { id: "parent-1", email: "parent@example.com" } as User;
const sitter = { id: "sitter-1", email: "sitter@example.com" } as User;

function mockClient(opts: {
  user?: User | null;
  error?: unknown;
  session?: { access_token: string } | null;
  signOutCalls: Array<string | undefined>;
  profile?: {
    role: string | null;
    role_selected?: boolean | null;
    parent_onboarding_completed_at?: string | null;
  } | null;
  sitterOnboardingAt?: string | null;
  getUserCalls?: { count: number };
}) {
  const profile = opts.profile ?? null;
  return {
    auth: {
      getUser: async () => {
        if (opts.getUserCalls) opts.getUserCalls.count += 1;
        return { data: { user: opts.user ?? null }, error: opts.error ?? null };
      },
      getSession: async () => ({ data: { session: opts.session ?? null } }),
      signOut: async (options?: { scope?: string }) => {
        opts.signOutCalls.push(options?.scope);
      }
    },
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        maybeSingle: async () => {
          if (table === "profiles") return { data: profile, error: null };
          if (table === "sitter_profiles") {
            return {
              data: { onboarding_completed_at: opts.sitterOnboardingAt ?? null },
              error: null
            };
          }
          return { data: null, error: null };
        }
      };
      return chain;
    }
  };
}

async function main() {
  const parentCalls: Array<string | undefined> = [];
  const parentRestore = await restoreHomeSession({
    manual: false,
    savedRole: null,
    supabase: mockClient({
      user: parent,
      session: { access_token: "parent-access" },
      signOutCalls: parentCalls,
      profile: {
        role: "parent",
        role_selected: true,
        parent_onboarding_completed_at: "2026-01-01T00:00:00.000Z"
      }
    })
  });
  assert.equal(parentRestore.status, "navigate");
  if (parentRestore.status === "navigate") {
    assert.equal(parentRestore.href, "/parent/dashboard");
    assert.equal(parentRestore.activeRole, "parent");
  }
  assert.equal(parentCalls.length, 0);

  const sitterCalls: Array<string | undefined> = [];
  const sitterRestore = await restoreHomeSession({
    manual: false,
    savedRole: null,
    supabase: mockClient({
      user: sitter,
      session: { access_token: "sitter-access" },
      signOutCalls: sitterCalls,
      profile: { role: "sitter", role_selected: true, parent_onboarding_completed_at: null },
      sitterOnboardingAt: "2026-02-01T00:00:00.000Z"
    })
  });
  assert.equal(sitterRestore.status, "navigate");
  if (sitterRestore.status === "navigate") {
    assert.equal(sitterRestore.href, "/sitter/dashboard");
    assert.equal(sitterRestore.activeRole, "sitter");
  }
  assert.equal(sitterCalls.length, 0);

  const hintedParent = await restoreHomeSession({
    manual: false,
    savedRole: "parent",
    supabase: mockClient({
      user: parent,
      session: { access_token: "parent-access" },
      signOutCalls: [],
      profile: {
        role: "parent",
        role_selected: true,
        parent_onboarding_completed_at: "2026-01-01T00:00:00.000Z"
      }
    })
  });
  assert.equal(hintedParent.status, "navigate");
  if (hintedParent.status === "navigate") assert.equal(hintedParent.href, "/parent/dashboard");

  const hintedSitter = await restoreHomeSession({
    manual: false,
    savedRole: "sitter",
    supabase: mockClient({
      user: sitter,
      session: { access_token: "sitter-access" },
      signOutCalls: [],
      profile: { role: "sitter", role_selected: true, parent_onboarding_completed_at: null },
      sitterOnboardingAt: "2026-02-01T00:00:00.000Z"
    })
  });
  assert.equal(hintedSitter.status, "navigate");
  if (hintedSitter.status === "navigate") assert.equal(hintedSitter.href, "/sitter/dashboard");

  const wrongPortal = await restoreHomeSession({
    manual: false,
    savedRole: "parent",
    supabase: mockClient({
      user: sitter,
      session: { access_token: "sitter-access" },
      signOutCalls: [],
      profile: { role: "sitter", role_selected: true, parent_onboarding_completed_at: null },
      sitterOnboardingAt: "2026-02-01T00:00:00.000Z"
    })
  });
  assert.equal(wrongPortal.status, "navigate");
  if (wrongPortal.status === "navigate") {
    assert.equal(wrongPortal.href, "/auth/role-mismatch?requested=parent");
    assert.equal(wrongPortal.activeRole, null);
  }

  const networkCalls: Array<string | undefined> = [];
  const networkReads = { count: 0 };
  const network = await restoreHomeSession({
    manual: false,
    savedRole: null,
    supabase: mockClient({
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 },
      session: { access_token: "still-there" },
      signOutCalls: networkCalls,
      getUserCalls: networkReads,
      profile: {
        role: "parent",
        role_selected: true,
        parent_onboarding_completed_at: "2026-01-01T00:00:00.000Z"
      }
    })
  });
  assert.equal(network.status, "unavailable");
  assert.equal(networkCalls.length, 0);
  assert.equal(networkReads.count, 1);

  const manualReads = { count: 0 };
  const manual = await restoreHomeSession({
    manual: true,
    savedRole: null,
    supabase: mockClient({
      user: parent,
      session: { access_token: "parent-access" },
      signOutCalls: [],
      getUserCalls: manualReads
    })
  });
  assert.equal(manual.status, "manual");
  assert.equal(manualReads.count, 0);

  const loggedOutCalls: Array<string | undefined> = [];
  const loggedOut = await restoreHomeSession({
    manual: false,
    savedRole: null,
    supabase: mockClient({
      user: null,
      session: null,
      signOutCalls: loggedOutCalls
    })
  });
  assert.equal(loggedOut.status, "welcome");
  assert.equal(loggedOutCalls.length, 0);

  const revokedCalls: Array<string | undefined> = [];
  const revoked = await restoreHomeSession({
    manual: false,
    savedRole: null,
    supabase: mockClient({
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" },
      session: { access_token: "revoked" },
      signOutCalls: revokedCalls
    })
  });
  assert.equal(revoked.status, "welcome");
  assert.deepEqual(revokedCalls, ["local"]);

  assert.equal(activeRoleForRestoredPath("/parent/dashboard"), "parent");
  assert.equal(activeRoleForRestoredPath("/sitter/dashboard"), "sitter");
  assert.equal(activeRoleForRestoredPath("/charter?role=sitter"), "sitter");
  assert.equal(activeRoleForRestoredPath("/auth/role-selection"), null);

  const home = read("app/page.tsx");
  const logout = read("lib/auth/logout.ts");
  assert.match(home, /searchParams\.get\("manual"\) === "true"/);
  assert.ok(home.indexOf('searchParams.get("manual") === "true"') < home.indexOf("setRestorePending(true)"));
  assert.match(logout, /await supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(logout, /clearDeviceAuthHints\(\)/);
  assert.doesNotMatch(logout, /scope: "global"/);
  const clearAt = logout.indexOf("clearDeviceAuthHints()");
  const signOutAt = logout.indexOf('await supabase.auth.signOut({ scope: "local" })');
  assert.ok(signOutAt >= 0 && clearAt > signOutAt);

  console.log("home-session-restore: ok");
}

void main();
