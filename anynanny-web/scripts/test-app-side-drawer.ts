import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_SIDE_DRAWER_MS,
  APP_SIDE_DRAWER_WIDTH,
  drawerPanelStyle,
  isAppDrawerRoute,
  nextDrawerPhase
} from "../lib/navigation/app-side-drawer";
import {
  ANYNANNY_PUBLIC_SITE_URL,
  appDrawerLinks,
  appDrawerSoonItems,
  isAppDrawerLinkActive,
  isDrawerTourPresentationStep,
  readDrawerTourPresentationHold
} from "../lib/navigation/app-side-drawer-destinations";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(APP_SIDE_DRAWER_WIDTH, "min(78vw, 340px)");
assert.equal(APP_SIDE_DRAWER_MS, 300);

assert.equal(isAppDrawerRoute("/parent/dashboard"), true);
assert.equal(isAppDrawerRoute("/sitter/surprises"), true);
assert.equal(isAppDrawerRoute("/sitter/onboarding"), true);
assert.equal(isAppDrawerRoute("/admin/reports"), false);
assert.equal(isAppDrawerRoute("/"), false);
assert.equal(isAppDrawerRoute("/login"), false);

assert.equal(nextDrawerPhase("closed", "open", false), "opening");
assert.equal(nextDrawerPhase("closed", "open", true), "open");
assert.equal(nextDrawerPhase("opening", "settle-open", false), "open");
assert.equal(nextDrawerPhase("opening", "close", false), "closed");
assert.equal(nextDrawerPhase("open", "close", false), "closing");
assert.equal(nextDrawerPhase("open", "close", true), "closed");
assert.equal(nextDrawerPhase("closing", "settle-closed", false), "closed");
assert.equal(nextDrawerPhase("open", "settle-closed", false), "open");
assert.equal(nextDrawerPhase("open", "force-closed", false), "closed");
assert.equal(nextDrawerPhase("opening", "open", false), "opening");

assert.equal(drawerPanelStyle("closed", false), undefined);
assert.equal(drawerPanelStyle("closed", true), undefined);

const opening = drawerPanelStyle("opening", false);
assert.equal(opening?.transform, "translate3d(100%, 0, 0)");
assert.equal(opening?.transition, undefined);

const open = drawerPanelStyle("open", false);
assert.equal(open?.transform, "translate3d(0, 0, 0)");
assert.equal(open?.transition, "transform 300ms ease-out");

const closing = drawerPanelStyle("closing", false);
assert.equal(closing?.transform, "translate3d(100%, 0, 0)");
assert.equal(closing?.transition, "transform 300ms ease-out");

const reducedOpen = drawerPanelStyle("open", true);
assert.equal(reducedOpen?.transform, "translate3d(0, 0, 0)");
assert.equal(reducedOpen?.transition, undefined);
assert.equal(JSON.stringify(drawerPanelStyle("closed", false) ?? {}), "{}");
assert.doesNotMatch(JSON.stringify(reducedOpen), /will-change/);

const gate = read("components/app-shell-gate.tsx");
const frame = read("components/navigation/app-side-drawer-frame.tsx");
const header = read("components/app-shell-header.tsx");
const drawer = read("components/navigation/app-side-drawer.tsx");
const menu = read("components/navigation/app-side-drawer-menu.tsx");
const hook = read("components/navigation/use-app-side-drawer.ts");
const bottomNav = read("components/bottom-nav.tsx");
const motion = read("lib/navigation/app-side-drawer.ts");

assert.match(gate, /isChromelessAuthPath\(pathname\) && isAppDrawerRoute\(pathname\)/);
assert.match(gate, /scrollRef\.current\?\.scrollTo\(\{ top: 0 \}\)/);
assert.match(gate, /<AppSideDrawerFrame/);
assert.match(gate, /StableBottomNav/);
assert.match(gate, /6\.5rem\+var\(--anynanny-now-dock,0px\)\+env\(safe-area-inset-bottom,0px\)/);
assert.equal((gate.match(/scrollTo\(/g) ?? []).length, 1);
assert.doesNotMatch(gate, /will-change|translate-x-|signOut|logoutAndRedirect/);
assert.match(frame, /APP_SHELL_SCROLL_ID/);
assert.match(frame, /overflow-y-auto/);
assert.match(frame, /drawerActive \? "overflow-hidden overscroll-none" : "overflow-y-auto overscroll-y-contain"/);
assert.match(frame, /\[&_\*\]:!pointer-events-none/);
assert.equal((frame.match(/inert=\{phase !== "closed"\}/g) ?? []).length, 2);
assert.match(frame, /h-dvh/);
assert.match(frame, /data-app-side-drawer=\{phase\}/);
assert.match(frame, /panelStyle=\{panelStyle\}/);
assert.doesNotMatch(frame, /style=\{panelStyle\}/);
assert.ok(frame.indexOf("<AppShellHeader") < frame.indexOf('inert={phase !== "closed"}'));
assert.ok(frame.indexOf('inert={phase !== "closed"}') < frame.indexOf("id={APP_SHELL_SCROLL_ID}"));
assert.doesNotMatch(frame, /will-change|scrollTo\(/);
assert.doesNotMatch(hook, /scrollTop|scrollTo\(/);
assert.doesNotMatch(motion, /will-change/);

assert.match(header, /variant="shell"/);
assert.match(header, /dir="ltr"/);
const menuClass = header.indexOf("className={`${CONTROL_CLASS} right-2`}");
const menuLabel = header.indexOf('aria-label="תפריט"');
assert.ok(menuClass !== -1 && menuLabel > menuClass && menuLabel - menuClass < 180);
assert.doesNotMatch(header, /left-2|<Home[\s/>]/);
assert.match(header, /justify-center/);
assert.match(header, /h-11 w-11/);
assert.match(header, /aria-expanded=\{menuExpanded\}/);
assert.match(header, /aria-controls=\{APP_SIDE_DRAWER_ID\}/);
assert.match(header, /aria-haspopup="dialog"/);
assert.match(header, /aria-label="תפריט"/);
assert.match(header, /aria-label="בית"/);
assert.match(header, /aria-current=\{homeActive \? "page" : undefined\}/);
assert.match(header, /currentRole === "sitter" \? "\/sitter\/dashboard" : "\/parent\/dashboard"/);
assert.match(header, /onHomePress \? \(/);
assert.match(header, /<Link/);
assert.doesNotMatch(header, /\/dev\/side-drawer/);
assert.match(frame, /onHomePress=\{onHomePress\}/);
assert.doesNotMatch(bottomNav, /data-preview-bottom-nav|onHomePress/);

assert.match(drawer, /absolute bottom-0 right-0/);
assert.match(drawer, /active \? "flex" : "hidden"/);
assert.match(drawer, /APP_SIDE_DRAWER_TOP/);
assert.match(drawer, /APP_SIDE_DRAWER_BOTTOM/);
assert.match(motion, /APP_SIDE_DRAWER_BOTTOM/);
assert.match(drawer, /APP_SIDE_DRAWER_BACKDROP/);
assert.match(drawer, /data-app-side-drawer-backdrop/);
assert.match(drawer, /aria-modal=\{active\}/);
const catcher = drawer.slice(drawer.indexOf("export function AppSideDrawerCatcher"));
assert.doesNotMatch(catcher, /aria-modal/);
assert.match(drawer, /aria-label="תפריט"/);
assert.match(drawer, /focusableElements\(root\)\[0\]/);
assert.doesNotMatch(drawer, /aria-label="סגור"|<h2|from "lucide-react"/);
assert.match(catcher, /aria-label="סגירת תפריט"/);
assert.match(catcher, /className="absolute bottom-0 left-0 right-0 z-\[60\]/);
assert.match(catcher, /top: APP_SIDE_DRAWER_TOP/);
assert.match(catcher, /bottom: APP_SIDE_DRAWER_BOTTOM/);
assert.match(catcher, /pointer-events-none/);
assert.match(read("components/app-shell-gate.tsx"), /onOpenMenu=\{drawer\.toggleDrawer\}/);
assert.match(hook, /const toggleDrawer = useCallback/);
assert.match(hook, /menuButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
assert.match(drawer, /<AppSideDrawerMenu/);
assert.match(drawer, /<AppSideDrawerLogout/);
assert.ok(drawer.indexOf("<AppSideDrawerMenu") < drawer.indexOf("<AppSideDrawerLogout"));
assert.match(drawer, /APP_SIDE_DRAWER_WIDTH/);
assert.match(drawer, /טפט תינוקות ירוק פסטלי doodle\.png/);
assert.match(drawer, /backgroundSize: "100% 100%, 100% auto"/);
assert.doesNotMatch(drawer, /bg-\[#FDFBF6\]/);
assert.match(drawer, /dir="rtl"/);
assert.doesNotMatch(drawer, /signOut|logoutAndRedirect|coupon|affiliate/);
assert.doesNotMatch(header, /signOut|logoutAndRedirect/);
assert.doesNotMatch(hook, /signOut|logoutAndRedirect/);
assert.doesNotMatch(menu, /signOut|logoutAndRedirect|coupon|affiliate|קהילות וקבוצות/);
assert.doesNotMatch(read("lib/navigation/app-side-drawer-destinations.ts"), /קהילות וקבוצות|communities/);

const parentLinks = appDrawerLinks("parent");
const sitterLinks = appDrawerLinks("sitter");
assert.deepEqual(
  parentLinks.map((item) => [item.label, item.href, item.tour ?? null, Boolean(item.external)]),
  [
    ["אזור אישי", "/parent/profile", "personal-area", false],
    ["הגדרות", "/parent/settings", "settings", false],
    ["לאתר AnyNanny", ANYNANNY_PUBLIC_SITE_URL, null, true]
  ]
);
assert.deepEqual(
  sitterLinks.map((item) => [item.label, item.href, item.tour ?? null, Boolean(item.external)]),
  [
    ["אזור אישי", "/sitter/profile", "sitter-personal-area", false],
    ["הגדרות", "/sitter/settings", "sitter-settings", false],
    ["לאתר AnyNanny", ANYNANNY_PUBLIC_SITE_URL, null, true]
  ]
);
assert.equal(ANYNANNY_PUBLIC_SITE_URL, "https://www.anynanny.org");
assert.deepEqual(
  appDrawerSoonItems().map((item) => [item.label, item.soonLabel, item.tone]),
  [
    ["ANYNANNY-מבצעים וקופונים", "בקרוב", "gold"],
    ["AnyNanny AI", "בקרוב", "muted"]
  ]
);
assert.equal(isAppDrawerLinkActive("/parent/profile", "/parent/profile"), true);
assert.equal(isAppDrawerLinkActive("/parent/profile/edit", "/parent/profile"), true);
assert.equal(isAppDrawerLinkActive("/parent/settings", "/parent/profile"), false);
assert.equal(isAppDrawerLinkActive("/sitter/settings", "/sitter/settings"), true);
assert.equal(isAppDrawerLinkActive("/parent/dashboard", "https://www.anynanny.org", true), false);
assert.equal(isDrawerTourPresentationStep("personal-area"), true);
assert.equal(isDrawerTourPresentationStep("settings"), true);
assert.equal(isDrawerTourPresentationStep("sitter-personal-area"), true);
assert.equal(isDrawerTourPresentationStep("sitter-settings"), true);
assert.equal(isDrawerTourPresentationStep("messages"), false);
assert.equal(isDrawerTourPresentationStep("anynanny-now"), false);
assert.equal(isDrawerTourPresentationStep("sitter-messages"), false);
assert.equal(isDrawerTourPresentationStep("sitter-surprises"), false);
assert.equal(isDrawerTourPresentationStep(null), false);
assert.equal(readDrawerTourPresentationHold(), false);

const soonRow = menu.slice(menu.indexOf("function DrawerSoonRow"), menu.indexOf("function DrawerLinkRow"));
assert.doesNotMatch(soonRow, /href|onClick|<Link|<a |<button/);
assert.match(soonRow, /data-app-drawer-soon/);
assert.match(soonRow, /drawer-gold-bar/);
assert.match(menu, /target="_blank"/);
assert.match(menu, /rel="noopener noreferrer"/);
assert.match(menu, /"data-tour": item\.tour/);
assert.match(menu, /text-\[#165B73\]/);
assert.match(menu, /border-\[#3A9A44\]\/45/);
assert.match(menu, /from "next\/link"/);
assert.doesNotMatch(menu, /router\.push|window\.location|signOut/);

const drawerLogout = read("components/navigation/app-side-drawer-logout.tsx");
assert.match(drawerLogout, /signedIn/);
assert.match(drawerLogout, /isAppDrawerRoute\(pathname\)/);
assert.match(drawerLogout, /currentRole === "sitter" \? \(\s*<LogoutButton \/>/);
assert.match(drawerLogout, /logoutAndRedirect\(router, "\/login"\)/);
assert.match(drawerLogout, /LOGOUT_SIGN_OUT_FAILED_MESSAGE/);
assert.doesNotMatch(drawerLogout, /supabase\.auth\.signOut\(\)|window\.location\.href|releaseStuckShift|effectiveRole/);
assert.doesNotMatch(read("components/parent/parent-dashboard-client.tsx"), /LogoutButtonContent|window\.location\.href = "\/login"/);
assert.doesNotMatch(read("app/sitter/dashboard/page.tsx"), /<LogoutButton|logoutAndRedirect/);
assert.match(read("app/parent/settings/page.tsx"), /<LogoutButton/);
assert.match(read("app/sitter/settings/page.tsx"), /<LogoutButton/);
assert.match(read("app/sitter/profile/page.tsx"), /<LogoutButton/);
assert.match(hook, /readDrawerTourPresentationHold/);
assert.match(hook, /APP_DRAWER_TOUR_OVERLAY_SELECTOR/);
assert.match(hook, /if \(readDrawerTourPresentationHold\(\)\) return;/);

assert.match(hook, /prefers-reduced-motion: reduce/);
assert.match(hook, /force-closed/);
assert.match(hook, /removeAttribute\("inert"\)/);
assert.match(hook, /event\.key !== "Escape"/);

assert.match(bottomNav, /AnyNanny Now/);
assert.match(bottomNav, /הפתעות/);
assert.match(bottomNav, /href="\/parent\/broadcast"/);
assert.match(bottomNav, /href="\/sitter\/surprises"/);
assert.match(bottomNav, /href: "\/parent\/wallet"/);
assert.match(bottomNav, /href: "\/parent\/calendar"/);
assert.match(bottomNav, /href: "\/parent\/history"/);
assert.match(bottomNav, /href: "\/sitter\/wallet"/);
assert.match(bottomNav, /href: "\/sitter\/availability"/);
assert.match(bottomNav, /href: "\/sitter\/shifts"/);
assert.match(bottomNav, /badgeKey: "wallet"/);
assert.doesNotMatch(bottomNav, /\/parent\/profile|\/parent\/settings|\/sitter\/profile|\/sitter\/settings/);
assert.doesNotMatch(bottomNav, /data-tour="personal-area"|data-tour="settings"|data-tour="sitter-personal-area"|data-tour="sitter-settings"/);

console.log("app side drawer infrastructure checks passed");
