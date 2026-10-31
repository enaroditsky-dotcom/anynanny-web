import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "scripts") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

const logout = read("lib/auth/logout.ts");
const push = read("lib/push/register-push.ts");
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const sitterDash = read("app/sitter/dashboard/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
const sitterProfile = read("app/sitter/profile/page.tsx");
const reset = read("app/auth/reset-password/page.tsx");
const deletion = read("components/account/delete-account-section.tsx");
const runtime = read("components/push/push-runtime.tsx");
const provider = read("components/auth-provider.tsx");
const button = read("components/account/logout-button.tsx");

const signOutAt = logout.indexOf('await supabase.auth.signOut({ scope: "local" })');
const unsubscribeAt = logout.indexOf("unsubscribeCurrentPushSubscription");
assert.ok(unsubscribeAt >= 0 && signOutAt > unsubscribeAt, "push cleanup still runs before signOut");
assert.doesNotMatch(logout, /reason: "push_cleanup"/);
assert.match(logout, /reason: "sign_out"/);
assert.match(logout, /notePushCleanupResult\(push, "logout"\)/);
assert.match(logout, /redirectPath = "\/login"/);
assert.match(logout, /clearNewBookingMarker\(\)/);
assert.match(logout, /unsubscribeCurrentPushSubscription/);
assert.match(logout, /signOut\(\{ scope: "local" \}\)/);
assert.doesNotMatch(logout, /scope: "global"/);
assert.match(reset, /supabase\.auth\.signOut\(\)/);
assert.doesNotMatch(reset, /scope: "local"/);
assert.match(deletion, /supabase\.auth\.signOut\(\)/);
assert.doesNotMatch(deletion, /scope: "local"/);

assert.match(dashboard, /logoutAndRedirect\(router, "\/login"\)/);
assert.doesNotMatch(dashboard, /supabase\.auth\.signOut\(\)/);
assert.match(button, /if \(result\.ok\) return/);
assert.match(button, /LOGOUT_SIGN_OUT_FAILED_MESSAGE/);
assert.doesNotMatch(button, /LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE/);

for (const source of [sitterDash, sitterSettings, sitterProfile]) {
  assert.match(source, /<LogoutButton/);
  assert.doesNotMatch(source, /supabase\.auth\.signOut\(\)/);
}

const release = push.slice(push.indexOf("export async function unsubscribeCurrentPushSubscription"));
const releaseBody = release.slice(0, release.indexOf("export async function alignDevicePushOwnership"));
assert.match(releaseBody, /persistSubscription\(sub\)/);
assert.match(releaseBody, /await sub\.unsubscribe\(\)/);
assert.match(releaseBody, /deleteOwnPushEndpoint\(endpoint\)/);
const claimAt = releaseBody.indexOf("persistSubscription(sub)");
const browserAt = releaseBody.indexOf("await sub.unsubscribe()");
const deleteAt = releaseBody.indexOf("deleteOwnPushEndpoint(endpoint)");
const browserFailAt = releaseBody.indexOf('reason: "browser"');
assert.ok(claimAt >= 0 && browserAt > claimAt && deleteAt > browserAt);
assert.ok(deleteAt < browserFailAt, "server delete is checked even when the browser unsubscribe fails");
assert.match(releaseBody, /if \(!deleted\.ok\) return \{ ok: false, reason: "server"/);

const align = push.slice(push.indexOf("export async function alignDevicePushOwnership"));
const alignBody = align.slice(0, align.indexOf("export async function reconcilePushSubscription"));
const alignClaim = alignBody.indexOf("persistSubscription(sub)");
const alignPreference = alignBody.indexOf("if (!pushEnabled)");
assert.ok(alignClaim >= 0 && alignPreference > alignClaim, "account switch claims the device before the push preference");
assert.match(runtime, /alignDevicePushOwnership\(prefs\.pushEnabled\)/);
assert.doesNotMatch(runtime, /reconcilePushSubscription\(prefs\.pushEnabled\)/);

const resetPush = reset.indexOf("unsubscribeCurrentPushSubscription");
const resetSignOut = reset.indexOf("supabase.auth.signOut()");
assert.ok(resetPush >= 0 && resetSignOut > resetPush);
assert.doesNotMatch(reset, /if \(!push\.ok\)/);
assert.match(reset, /window\.location\.replace\(LOGIN_PATH\)/);
assert.match(reset, /PASSWORD_UPDATED_MESSAGE/);

const deletePush = deletion.indexOf("unsubscribeCurrentPushSubscription");
const deleteAccount = deletion.indexOf("deleteCurrentUserAccount(supabase)");
const deleteSignOut = deletion.indexOf("supabase.auth.signOut()");
assert.ok(deletePush >= 0 && deleteAccount > deletePush && deleteSignOut > deleteAccount);
assert.doesNotMatch(deletion, /if \(!push\.ok\)/);
assert.match(deletion, /window\.location\.assign\("\/"\)/);
assert.match(deletion, /clearDeviceAuthHints\(\)/);
assert.match(deletion, /clearNewBookingMarker\(\)/);

const signedOut = provider.slice(provider.indexOf('event !== "SIGNED_OUT"'));
assert.match(signedOut, /requestGenRef\.current \+= 1/);
assert.match(signedOut, /noteSettled\(\)/);
assert.match(signedOut, /setUser\(null\)/);

const explicitSignOutFiles = walk(root)
  .map((file) => relative(root, file).replaceAll("\\", "/"))
  .filter((file) => /supabase\.auth\.signOut\(/.test(read(file)));
assert.deepEqual(explicitSignOutFiles.sort(), [
  "app/auth/reset-password/page.tsx",
  "components/account/delete-account-section.tsx",
  "lib/auth/logout.ts"
]);

console.log("auth-phase-2a: ok");
