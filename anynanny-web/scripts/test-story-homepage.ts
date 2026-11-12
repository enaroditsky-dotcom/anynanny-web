import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETING_CHAPTERS, storyChapterHref } from "../lib/marketing/chapters";
import {
  MARKETING_APP,
  MARKETING_HERO,
  MARKETING_SLOGAN,
  MARKETING_TOGETHER
} from "../lib/marketing/copy";
import {
  DOMAIN_SEPARATION_ENABLED,
  WWW_MARKETING_ROOT_ENABLED
} from "../lib/hosts/site-classifier";
import {
  APP_ENTRY_HREF,
  DEFAULT_OPEN_NAV_IDS,
  IPHONE_APP_STORE_URL,
  SITE_NAV_DOWNLOADS,
  SITE_NAV_ITEMS,
  withStoreCampaign,
  collectDestinations,
  destinationHref
} from "../lib/marketing/site-nav";
import { storyAccountHref, storyLoginHref } from "../lib/marketing/story-entry";
import { buildPublicRobots } from "../lib/seo/public-robots";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(DOMAIN_SEPARATION_ENABLED, true);
assert.equal(WWW_MARKETING_ROOT_ENABLED, true);

assert.equal(MARKETING_CHAPTERS.length, 10);
assert.deepEqual(
  MARKETING_CHAPTERS.map((chapter) => chapter.id),
  ["home", "about", "founder", "life", "community", "parents", "sitters", "app", "respect", "together"]
);

const home = read("components/marketing/marketing-home.tsx");
const demo = read("components/marketing/story-app-demo.tsx");
const sidebar = read("components/marketing/marketing-sidebar.tsx");
const siteNav = read("lib/marketing/site-nav.ts");
const mobile = read("components/marketing/marketing-mobile-actions.tsx");
const page = read("app/page.tsx");

for (const chapter of MARKETING_CHAPTERS) {
  assert.match(`${home}\n${demo}`, new RegExp(`id="${chapter.id}"`));
  assert.equal(
    destinationHref({ kind: "chapter", chapterId: chapter.id }),
    storyChapterHref(chapter.id)
  );
}

assert.equal(MARKETING_HERO.appCta, "כניסה לאפליקציה");
assert.equal(MARKETING_HERO.artSrc, "/marketing/story/opening-hero.png");
assert.equal(MARKETING_SLOGAN, "פשוט למצוא זמן לחיים");
assert.equal(MARKETING_APP.demoSrc, "/marketing/demo/index.html");
assert.match(home, /StoryAppDemo/);
assert.match(home, /data-app-move-notice/);
assert.match(home, /מחפשים את אפליקציית AnyNanny\?/);
assert.match(home, /האפליקציה עברה לכתובת חדשה/);
assert.match(home, /app\.anynanny\.org/);
assert.match(home, /כניסה לאפליקציה/);
assert.doesNotMatch(home, /MarketingAnalytics|@vercel\/analytics/);
assert.match(home, /href=\{openAppHref\}/);
assert.equal(DEFAULT_OPEN_NAV_IDS.length, 0);
assert.match(siteNav, /DEFAULT_OPEN_NAV_IDS = \[\]/);
assert.match(sidebar, /DEFAULT_OPEN_NAV_IDS/);
assert.match(read("components/marketing/marketing-portal.tsx"), /useState\(false\)/);
assert.doesNotMatch(home, /href="\/login"|href="\/register"|router\.push/);
assert.doesNotMatch(read("components/marketing/marketing-header.tsx"), /href="\/login"|\/auth\/login/);
assert.doesNotMatch(mobile, /href="\/login"|APP_LOGIN_HREF|\/auth\/login/);
assert.match(page, /if \(!marketingRootActive\(\)\) return <ApplicationHomePage \/>/);
assert.match(page, /ConversionHome/);
assert.doesNotMatch(page, /MarketingHomePage/);
assert.match(read("app/story/page.tsx"), /MarketingHomePage/);
assert.match(sidebar, /href="\/"/);
assert.match(read("components/marketing/marketing-portal.tsx"), /storyChapterHref/);
assert.match(read("components/marketing/marketing-header.tsx"), /storyChapterHref\("home"\)/);
assert.match(read("components/app-shell-gate.tsx"), /"\/story"/);
assert.equal(APP_ENTRY_HREF, "/app");
assert.match(read("app/app/page.tsx"), /AppLanding|app-landing|APP_LANDING/);

for (const filename of [
  "opening-hero.png",
  "chapter-1-artwork.png",
  "chapter-2-artwork.png",
  "chapter-3-artwork.png",
  "chapter-4-doorway.png",
  "chapter-5-collage.png",
  "chapter-6-collage.png",
  "chapter-8-respect.png",
  "chapter-10-four-scenes.png"
]) {
  const disk = resolve(root, `public/marketing/story/${filename}`);
  assert.equal(existsSync(disk), true, filename);
  assert.ok(statSync(disk).size > 1000, filename);
}

const soon = collectDestinations(SITE_NAV_ITEMS).filter((destination) => destination.kind === "soon");
assert.equal(soon.length, 1);
assert.equal(destinationHref(soon[0]), null);
assert.doesNotMatch(JSON.stringify(SITE_NAV_ITEMS), /פורום AnyNanny|AnyNanny Marketplace|קהילת AnyNanny|מגזין/);
const findBabysitterNav = SITE_NAV_ITEMS.find((item) => item.id === "find-babysitter");
const babysitterWorkNav = SITE_NAV_ITEMS.find((item) => item.id === "babysitter-work");
const homeNav = SITE_NAV_ITEMS.find((item) => item.id === "home");
const appNav = SITE_NAV_ITEMS.find((item) => item.id === "app-entry");
const offersNav = SITE_NAV_ITEMS.find((item) => item.id === "offers");
const exploreNav = SITE_NAV_ITEMS.find((item) => item.id === "explore");
assert.deepEqual(
  homeNav?.type === "link" ? { label: homeNav.label, destination: homeNav.destination } : null,
  { label: "דף הבית", destination: { kind: "href", href: "/" } }
);
assert.deepEqual(
  findBabysitterNav?.type === "link"
    ? { label: findBabysitterNav.label, destination: findBabysitterNav.destination }
    : null,
  { label: "מציאת בייביסיטר", destination: { kind: "href", href: "/parents" } }
);
assert.deepEqual(
  babysitterWorkNav?.type === "link"
    ? { label: babysitterWorkNav.label, destination: babysitterWorkNav.destination }
    : null,
  { label: "עבודה כבייביסיטרית", destination: { kind: "href", href: "/babysitter" } }
);
assert.equal(appNav?.type === "link" ? appNav.label : "", "לכניסה ולהורדת האפליקציה");
assert.deepEqual(appNav?.type === "link" ? appNav.destination : null, { kind: "href", href: "/app" });
assert.equal(offersNav?.type === "link" ? offersNav.label : "", "ANYNANNY-מבצעים וקופונים");
assert.equal(offersNav?.type === "link" ? offersNav.tone : "", "offer");
assert.equal(offersNav?.type === "link" ? destinationHref(offersNav.destination) : "linked", null);
assert.equal(exploreNav?.type, "accordion");
assert.deepEqual(
  exploreNav?.type === "accordion"
    ? exploreNav.children.map((child) => (child.type === "link" ? child.destination : null))
    : [],
  [
    { kind: "href", href: "/story" },
    { kind: "href", href: "/marketing/trust" },
    { kind: "href", href: "/marketing/respect" },
    { kind: "href", href: "/marketing/preview" }
  ]
);
assert.doesNotMatch(sidebar, /play\.google\.com|apps\.apple\.com/);
assert.doesNotMatch(sidebar, /כניסה לאפליקציה/);
assert.match(read("components/marketing/marketing-press.css"), /scale\(0\.97\)/);
assert.match(read("components/marketing/marketing-press.css"), /prefers-reduced-motion/);
assert.match(read("components/marketing/marketing-portal.tsx"), /data-marketing-portal/);
const iphoneDownload = SITE_NAV_DOWNLOADS.find((item) => item.id === "download-iphone");
const androidDownload = SITE_NAV_DOWNLOADS.find((item) => item.id === "download-android");
assert.equal(iphoneDownload?.destination.kind, "href");
if (iphoneDownload?.destination.kind === "href") {
  assert.equal(iphoneDownload.destination.href, IPHONE_APP_STORE_URL);
}
assert.equal(
  withStoreCampaign(IPHONE_APP_STORE_URL, "?utm_source=ig&utm_medium=cpc&code=secret"),
  "https://apps.apple.com/il/app/anynanny/id6813214477?utm_source=ig&utm_medium=cpc"
);
assert.equal(androidDownload?.destination.kind, "soon");
assert.match(read("components/marketing/marketing-sidebar.tsx"), /AnyNanny%20logo%20new\.png/);
assert.doesNotMatch(read("components/marketing/marketing-sidebar.tsx"), /anynanny-clean-transparent/);
assert.match(read("lib/marketing/copy.ts"), /גרסת Google Play — בקרוב/);
assert.doesNotMatch(read("lib/marketing/copy.ts"), /App Store — בקרוב/);

assert.equal(storyLoginHref("?utm_source=ig&type=recovery", false), "/login?utm_source=ig");
assert.equal(storyLoginHref("?utm_source=ig&type=recovery"), "https://app.anynanny.org/login?utm_source=ig");
assert.equal(storyLoginHref("?utm_source=ig", true), "https://app.anynanny.org/login?utm_source=ig");
const register = new URL(storyAccountHref("register", "parent", "?utm_source=ig&code=secret", true));
assert.equal(register.origin, "https://app.anynanny.org");
assert.equal(register.pathname, "/welcome");
assert.equal(register.searchParams.get("role"), "parent");
assert.equal(register.searchParams.get("utm_source"), "ig");
assert.equal(register.searchParams.get("code"), null);
assert.match(register.searchParams.get("next") ?? "", /^\/register\?/);
assert.equal(storyAccountHref("login", "sitter", "", false), "/login?role=sitter&track=babysitter");
assert.equal(MARKETING_TOGETHER.loginLabel, "כניסה לאפליקציה");
assert.match(read("public/marketing/demo/store-links.js"), /const DOMAIN_SEPARATION_ENABLED = true/);

assert.match(read("app/robots.ts"), /buildPublicRobots/);
assert.match(read("app/sitemap.ts"), /buildPublicSitemap/);
assert.match(read("app/privacy/page.tsx"), /canonical: absoluteSiteUrl\("\/privacy"\)/);
assert.match(read("app/terms/page.tsx"), /canonical: absoluteSiteUrl\("\/terms"\)/);
assert.match(read("app/delete-account/page.tsx"), /canonical: absoluteSiteUrl\("\/delete-account"\)/);
const robots = buildPublicRobots();
assert.equal(robots.sitemap, "https://www.anynanny.org/sitemap.xml");
const urls = buildPublicSitemap().map((entry) => entry.url);
for (const path of ["/", "/story", "/parents", "/babysitter", "/jobs/students", "/app", "/privacy", "/terms", "/delete-account"]) {
  assert.equal(urls.includes(`https://www.anynanny.org${path === "/" ? "/" : path}`), true, path);
}
assert.equal(urls.some((url) => url.includes("/parent/")), false);

console.log("story homepage: ok");
