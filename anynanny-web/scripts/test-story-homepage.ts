import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETING_CHAPTERS } from "../lib/marketing/chapters";
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
  SITE_NAV_ITEMS,
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

assert.equal(DOMAIN_SEPARATION_ENABLED, false);
assert.equal(WWW_MARKETING_ROOT_ENABLED, false);

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
assert.match(home, /useState\(false\)/);
assert.doesNotMatch(home, /href="\/login"|href="\/register"|router\.push/);
assert.doesNotMatch(read("components/marketing/marketing-header.tsx"), /href="\/login"|\/auth\/login/);
assert.doesNotMatch(mobile, /href="\/login"|APP_LOGIN_HREF|\/auth\/login/);
assert.match(page, /if \(!marketingRootActive\(\)\) return <ApplicationHomePage \/>/);
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
assert.ok(soon.length >= 4);
for (const destination of soon) {
  assert.equal(destinationHref(destination), null);
}
assert.match(siteNav, /פורום AnyNanny/);
assert.match(siteNav, /AnyNanny Marketplace/);
assert.doesNotMatch(sidebar, /play\.google\.com|apps\.apple\.com/);

assert.equal(storyLoginHref("?utm_source=ig&type=recovery"), "/login?utm_source=ig");
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
assert.match(read("public/marketing/demo/store-links.js"), /const DOMAIN_SEPARATION_ENABLED = false/);

assert.match(read("app/robots.ts"), /buildPublicRobots/);
assert.match(read("app/sitemap.ts"), /buildPublicSitemap/);
assert.match(read("app/privacy/page.tsx"), /canonical: absoluteSiteUrl\("\/privacy"\)/);
assert.match(read("app/terms/page.tsx"), /canonical: absoluteSiteUrl\("\/terms"\)/);
assert.match(read("app/delete-account/page.tsx"), /canonical: absoluteSiteUrl\("\/delete-account"\)/);
const robots = buildPublicRobots();
assert.equal(robots.sitemap, "https://www.anynanny.org/sitemap.xml");
const urls = buildPublicSitemap().map((entry) => entry.url);
for (const path of ["/", "/parents", "/babysitter", "/jobs/students", "/app", "/privacy", "/terms", "/delete-account"]) {
  assert.equal(urls.includes(`https://www.anynanny.org${path === "/" ? "/" : path}`), true, path);
}
assert.equal(urls.some((url) => url.includes("/parent/")), false);

console.log("story homepage: ok");
