import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const page = read("app/dev/side-drawer/page.tsx");
const preview = read("app/dev/side-drawer/drawer-preview.tsx");
const gate = read("components/app-shell-gate.tsx");
const frame = read("components/navigation/app-side-drawer-frame.tsx");
const middleware = read("middleware.ts");
const parentLayout = read("app/parent/layout.tsx");
const sitterLayout = read("app/sitter/layout.tsx");
const header = read("components/app-shell-header.tsx");
const bottomNav = read("components/bottom-nav.tsx");
const drawer = read("components/navigation/app-side-drawer.tsx");

const pageHeader = page.split("export default")[0] ?? "";
assert.match(page, /process\.env\.NODE_ENV === "development"/);
assert.match(page, /notFound\(\)/);
assert.doesNotMatch(page, /NEXT_PUBLIC_/);
assert.doesNotMatch(pageHeader, /drawer-preview/);
assert.match(page, /require\("\.\/drawer-preview"\)/);
const developmentGuard = page.indexOf('process.env.NODE_ENV === "development"');
const previewRequire = page.indexOf('require("./drawer-preview")');
const notFoundCall = page.indexOf("notFound()");
assert.ok(developmentGuard !== -1 && previewRequire > developmentGuard && notFoundCall > previewRequire);

assert.match(gate, /"\/dev\/side-drawer"/);
assert.match(gate, /AppSideDrawerFrame/);
assert.doesNotMatch(middleware, /side-drawer/);
assert.doesNotMatch(parentLayout, /side-drawer/);
assert.doesNotMatch(sitterLayout, /side-drawer/);
assert.doesNotMatch(header, /\/dev\/side-drawer/);
assert.doesNotMatch(bottomNav, /\/dev\/side-drawer/);
assert.doesNotMatch(drawer, /\/dev\/side-drawer/);

assert.match(preview, /useAppSideDrawer\(true,/);
assert.match(preview, /AppSideDrawerFrame/);
assert.match(preview, /החלף נתיב מדומה/);
assert.match(preview, /הצג חלון חוסם/);
assert.match(preview, /aria-modal="true"/);
assert.match(preview, /data-dev-side-drawer-preview/);
assert.match(preview, /תפריט הורה/);
assert.match(preview, /תפריט בייביסיטר/);
assert.match(preview, /הדמיית סיור במגירה/);
assert.match(preview, /data-product-tour-overlay/);
assert.match(preview, /PreviewHome/);
assert.match(preview, /PreviewBottomNav/);
assert.match(preview, /onHomePress=/);
assert.match(preview, /scrollRef\.current\?\.scrollTo\(\{ top: 0 \}\)/);
assert.doesNotMatch(preview, /\/parent\/dashboard|\/sitter\/dashboard/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /data-preview-bottom-nav/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /AnyNanny Now/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /הפתעות/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /sitter-surprises-button\.png/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /env\(safe-area-inset-bottom\)/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /dir="ltr"/);
assert.doesNotMatch(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /<Link|href=|signOut|logoutAndRedirect|supabase/);
assert.doesNotMatch(read("app/dev/side-drawer/preview-home.tsx"), /<Link|href=|signOut|logoutAndRedirect|supabase/);
assert.match(read("app/dev/side-drawer/preview-home.tsx"), /data-preview-home/);
assert.match(read("app/dev/side-drawer/preview-home.tsx"), /תצוגה סטטית/);
assert.doesNotMatch(read("app/dev/side-drawer/preview-home.tsx"), /יומן עבודה|משמרות|grid-cols-3|StaticTile/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /יומן עבודה/);
assert.match(read("app/dev/side-drawer/preview-bottom-nav.tsx"), /משמרות/);
assert.match(preview, /function PreviewDrawerLogout/);
assert.match(preview, /createPortal/);
assert.match(preview, /APP_SIDE_DRAWER_ID/);
assert.match(preview, /data-dev-drawer-logout/);
assert.match(preview, /LOGOUT_BUTTON_CLASS/);
assert.match(preview, /<LogoutButtonContent \/>/);
assert.match(preview, /aria-disabled="true"/);
assert.match(preview, /event\.preventDefault\(\)/);
assert.match(preview, /event\.stopPropagation\(\)/);
assert.doesNotMatch(preview, /<LogoutButton[\s/>]/);
assert.doesNotMatch(preview, /<Link|href=|signIn|signUp|setSession|service_role|supabase|signOut|logoutAndRedirect/);

const appLogout = read("components/navigation/app-side-drawer-logout.tsx");
assert.match(appLogout, /if \(!signedIn \|\| !isAppDrawerRoute\(pathname\)\) return null/);
assert.match(appLogout, /currentRole === "sitter" \? \([\s\S]*<LogoutButton \/>/);
assert.match(appLogout, /supabase\.auth\.signOut\(\)/);
assert.match(appLogout, /window\.location\.href = "\/login"/);
assert.doesNotMatch(appLogout, /data-dev-drawer-logout|\/dev\/side-drawer/);

assert.match(frame, /AppShellHeader/);
assert.match(frame, /<AppSideDrawer[\s>]/);
assert.match(frame, /<AppSideDrawerCatcher /);
assert.match(frame, /APP_SHELL_SCROLL_ID/);
assert.match(frame, /overflow-y-auto/);
assert.match(frame, /h-dvh/);
assert.match(frame, /data-app-side-drawer=\{phase\}/);
assert.doesNotMatch(frame, /will-change|signOut|logoutAndRedirect|href=/);

console.log("dev side drawer preview: ok");
