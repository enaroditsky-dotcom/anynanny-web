import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "@supabase/supabase-js";
import { AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT } from "../lib/auth/post-auth-destination";
import {
  canHonorAuthNextParam,
  isAuthUserRejectedError,
  resolveValidAuthUser,
  shouldClearStaleSession
} from "../lib/auth/valid-session";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const login = read("app/auth/login/page.tsx");
const roleSelection = read("app/auth/role-selection/page.tsx");
const middleware = read("middleware.ts");
const authProvider = read("components/auth-provider.tsx");
const validSession = read("lib/auth/valid-session.ts");
const postAuth = read("lib/auth/post-auth-destination.ts");
const signUp = read("app/auth/sign-up/page.tsx");
const redirectAfter = read("lib/auth/redirect-after-sign-in.ts");

const user = { id: "user-1", email: "new.parent@example.com" } as User;

function mockClient(opts: {
  user?: User | null;
  error?: unknown;
  session?: { access_token: string } | null;
  signOutCalls: unknown[];
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: opts.error ?? null }),
      getSession: async () => ({ data: { session: opts.session ?? null } }),
      signOut: async () => {
        opts.signOutCalls.push("local");
      }
    }
  };
}

async function main() {
  // 1. unauthenticated → login
  assert.equal(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT, "/auth/login?next=/auth/role-selection");
  assert.match(roleSelection, /AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT/);
  assert.match(roleSelection, /resolveValidAuthUser/);
  assert.equal(
    (await resolveValidAuthUser(mockClient({ user: null, session: null, signOutCalls: [] }))).ok,
    false
  );
  assert.equal(canHonorAuthNextParam(false), false);

  // 2. valid authenticated → role-selection
  const valid = await resolveValidAuthUser(mockClient({ user, session: { access_token: "ok" }, signOutCalls: [] }));
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.user.id, "user-1");
  assert.equal(canHonorAuthNextParam(true), true);
  assert.match(roleSelection, /setSessionGate\("authed"\)/);
  assert.match(postAuth, /return "\/auth\/role-selection"/);

  // 3. invalid/stale session → login once, no loop
  const staleCalls: unknown[] = [];
  const stale = await resolveValidAuthUser(
    mockClient({
      user: null,
      error: { status: 403, message: "Forbidden" },
      session: { access_token: "stale" },
      signOutCalls: staleCalls
    })
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.clearedStaleSession, true);
  assert.equal(staleCalls.length, 1);
  assert.equal(shouldClearStaleSession({ user: null, error: { status: 403 }, hasLocalSession: true }), true);

  const afterClear = await resolveValidAuthUser(
    mockClient({ user: null, session: null, signOutCalls: staleCalls })
  );
  assert.equal(afterClear.ok, false);
  assert.equal(afterClear.clearedStaleSession, false);
  assert.equal(staleCalls.length, 1);

  // 4. next=/auth/role-selection does not redirect until valid session exists
  assert.equal(canHonorAuthNextParam(false), false);
  assert.match(login, /resolveValidAuthUser/);
  assert.match(login, /if \(cancelled \|\| !resolved\.ok\) return;/);
  assert.doesNotMatch(login, /supabase\.auth\.getSession\(\)/);

  // 5. confirmed new user can sign in and continue to onboarding
  assert.match(login, /signInWithPassword/);
  assert.match(login, /navigateAfterAuth/);
  assert.match(login, /data\.user\.id/);
  assert.match(roleSelection, /RoleSelectionScreen/);
  assert.match(postAuth, /PARENT_ONBOARDING_PATH|pathBeforeRoleOnboarding/);

  // 6. 403 from getUser does not cause repeated redirects
  assert.equal(isAuthUserRejectedError({ status: 403, message: "Forbidden" }), true);
  assert.equal(isAuthUserRejectedError({ status: 401 }), true);
  assert.equal(isAuthUserRejectedError(null), false);
  assert.match(validSession, /signOut\(\{ scope: "local" \}\)/);
  assert.match(validSession, /staleClearInFlight/);
  assert.match(authProvider, /resolveValidAuthUser/);

  // 7. middleware does not create a cycle
  assert.match(middleware, /auth\//);
  assert.match(middleware, /matcher/);
  assert.doesNotMatch(middleware, /\/auth\/role-selection/);
  assert.doesNotMatch(middleware, /\/auth\/login/);

  // 8. existing login/signup flows remain unchanged
  assert.match(login, /handleSubmit/);
  assert.match(login, /שכחת סיסמה\?/);
  assert.match(signUp, /handleSignUp/);
  assert.match(redirectAfter, /resolvePostAuthPath/);
  assert.match(login, /onAuthStateChange/);
  assert.match(login, /PASSWORD_RECOVERY/);

  // 9. Android/TWA/Google Play untouched
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8"
  }).trim();
  const gitFiles = execFileSync("git", ["status", "--porcelain", "--", "android", "twa"], {
    cwd: gitRoot,
    encoding: "utf8"
  }).trim();
  assert.equal(gitFiles, "", `Android/TWA files must be untouched, got:\n${gitFiles}`);
  assert.equal(existsSync(resolve(gitRoot, "android/app/build.gradle.kts")), true);
  assert.equal(readdirSync(resolve(gitRoot, "android")).includes("app"), true);
  assert.doesNotMatch([login, roleSelection, validSession, authProvider].join("\n"), /android\/|twa|assetlinks|google play/i);

  console.log("auth-role-selection-loop: ok");
}

void main();
