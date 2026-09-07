import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, acc);
    else if (entry.name.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

const logoutButton = read("components/account/logout-button.tsx");
assert.match(logoutButton, /LOGOUT_BUTTON_LABEL = "התנתקות"/);
assert.match(logoutButton, /LOGOUT_BUTTON_CLASS =/);
assert.match(logoutButton, /bg-rose-50\/30/);
assert.match(logoutButton, /border-rose-200/);
assert.match(logoutButton, /rounded-xl/);
assert.match(logoutButton, /text-rose-700/);
assert.match(logoutButton, /from "lucide-react"/);
assert.match(logoutButton, /\bUnplug\b/);
assert.doesNotMatch(logoutButton, /\bLogOut\b/);
assert.doesNotMatch(logoutButton, /\bPower\b/);
assert.match(logoutButton, /text-sm font-semibold/);
assert.match(logoutButton, /h-5 w-5 shrink-0/);
assert.match(logoutButton, /gap-\[0\.5em\]/);
assert.doesNotMatch(logoutButton, /gap-\[1\.5ch\]/);
assert.doesNotMatch(logoutButton, /h-4 w-4/);
assert.doesNotMatch(logoutButton, /text-xs/);
assert.match(logoutButton, /dir="ltr"/);
assert.match(logoutButton, /aria-hidden/);
assert.match(logoutButton, /logoutAndRedirect\(router\)/);
assert.match(logoutButton, /<LogoutButtonContent label=\{busy \? "מתנתק…" : label\} \/>/);

const dashboard = read("components/parent/parent-dashboard-client.tsx");
assert.match(dashboard, /LOGOUT_BUTTON_CLASS/);
assert.match(dashboard, /<LogoutButtonContent \/>/);
assert.match(dashboard, /supabase\.auth\.signOut\(\)/);
assert.match(dashboard, /window\.location\.href = "\/login"/);
assert.doesNotMatch(dashboard, /\bUnplug\b/);
assert.doesNotMatch(dashboard, /\bLogOut\b/);
assert.doesNotMatch(dashboard, /logoutAndRedirect/);

const logoutButtonUsages = [
  "app/parent/settings/page.tsx",
  "app/sitter/settings/page.tsx",
  "app/sitter/dashboard/page.tsx",
  "app/sitter/profile/page.tsx",
  "components/safety/account-suspended-gate.tsx"
];
for (const file of logoutButtonUsages) {
  const source = read(file);
  assert.match(source, /<LogoutButton/);
  assert.doesNotMatch(source, /\bLogOut\b/);
  assert.doesNotMatch(source, /\bUnplug\b/);
}

const labeledLogoutFiles: string[] = [];
for (const file of walkTsx(root)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.startsWith("scripts/")) continue;
  const source = read(rel);
  if (!source.includes("התנתקות")) continue;
  labeledLogoutFiles.push(rel);

  if (rel === "components/settings/mobile-settings-ui.tsx") {
    assert.match(source, /התנתקות מהחשבון במכשיר זה/);
    assert.doesNotMatch(source, />התנתקות</);
    continue;
  }

  if (rel === "components/account/logout-button.tsx") {
    assert.match(source, /LOGOUT_BUTTON_LABEL = "התנתקות"/);
    assert.match(source, /\bUnplug\b/);
    continue;
  }

  assert.fail(`unexpected התנתקות copy in ${rel}; logout buttons must reuse LogoutButton / LogoutButtonContent`);
}

assert.ok(labeledLogoutFiles.includes("components/account/logout-button.tsx"));
assert.ok(labeledLogoutFiles.includes("components/settings/mobile-settings-ui.tsx"));
assert.equal(labeledLogoutFiles.length, 2);

console.log("Logout button Unplug layout checks passed.");
