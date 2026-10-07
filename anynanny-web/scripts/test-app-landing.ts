import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";
import {
  APP_LANDING_APP_STORE_LABEL,
  APP_LANDING_APP_STORE_URL,
  APP_LANDING_CANONICAL,
  APP_LANDING_CLOSING,
  APP_LANDING_DESCRIPTION,
  APP_LANDING_GOOGLE_PLAY_URL,
  APP_LANDING_H1,
  APP_LANDING_HERO_ALT,
  APP_LANDING_HERO_SRC,
  APP_LANDING_OG_DESCRIPTION,
  APP_LANDING_OG_TITLE,
  APP_LANDING_PARENT_CTA,
  APP_LANDING_PARENT_ENTRY_CTA,
  APP_LANDING_PATH,
  APP_LANDING_SITTER_CTA,
  APP_LANDING_SITTER_ENTRY_CTA,
  APP_LANDING_TITLE,
  appLandingSignupHref,
  buildAppLandingStructuredData
} from "../lib/marketing/app-landing";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(existsSync(resolve(root, "app/app/page.tsx")), true);
assert.equal(existsSync(resolve(root, "app/anynanny/page.tsx")), false);
assert.equal(APP_LANDING_PATH, "/app");
assert.equal(APP_LANDING_CANONICAL, "https://www.anynanny.org/app");
assert.equal(APP_LANDING_H1, "AnyNanny — בייביסיטר למשפחות ועבודה לבייביסיטריות");
assert.equal(APP_LANDING_TITLE, "AnyNanny | בייביסיטר למשפחות ועבודה לבייביסיטריות");
assert.match(APP_LANDING_DESCRIPTION, /הצטרפו ל־AnyNanny/);
assert.equal(APP_LANDING_OG_TITLE, APP_LANDING_H1);
assert.match(APP_LANDING_OG_DESCRIPTION, /אימות זהות במקום אחד/);
assert.equal(APP_LANDING_HERO_ALT, "AnyNanny - אפליקציה להורים ולבייביסיטריות בישראל");
assert.equal(APP_LANDING_HERO_SRC, "/SEO pages/anynanny banner p and b.png");
assert.equal(APP_LANDING_APP_STORE_URL, "https://apps.apple.com/il/app/anynanny/id6813214477");
assert.equal(APP_LANDING_GOOGLE_PLAY_URL, "");
assert.equal(APP_LANDING_APP_STORE_LABEL, "להורדה ב־App Store");
assert.equal(APP_LANDING_CLOSING, "AnyNanny — פשוט למצוא זמן לחיים.");
assert.equal(APP_LANDING_SITTER_CTA, "להרשמה כבייביסיטרית");
assert.equal(APP_LANDING_PARENT_CTA, "לחיפוש בייביסיטר");
assert.equal(APP_LANDING_PARENT_ENTRY_CTA, "אני מחפש/ת בייביסיטר");
assert.equal(APP_LANDING_SITTER_ENTRY_CTA, "אני רוצה לעבוד כבייביסיטרית");

const parentHref = appLandingSignupHref("parent");
const sitterHref = appLandingSignupHref("sitter");
assert.match(parentHref, /^\/welcome\?/);
assert.match(parentHref, /role=parent/);
assert.doesNotMatch(parentHref, /track=babysitter/);
assert.match(sitterHref, /role=sitter/);
assert.match(sitterHref, /track%3Dbabysitter|track=babysitter/);
assert.doesNotMatch(parentHref, /role=sitter/);
assert.doesNotMatch(sitterHref, /role=parent/);

const withUtm = appLandingSignupHref("sitter", "utm_source=facebook&utm_campaign=groups&ignored=1");
assert.match(withUtm, /utm_source=facebook/);
assert.match(withUtm, /utm_campaign=groups/);
assert.doesNotMatch(withUtm, /ignored=/);

const page = read("app/app/page.tsx");
const landing = read("components/marketing/app-landing.tsx");
const shell = read("components/app-shell-gate.tsx");
assert.match(page, /canonical: APP_LANDING_CANONICAL/);
assert.match(page, /title: APP_LANDING_OG_TITLE/);
assert.match(page, /card: "summary_large_image"/);
assert.match(landing, /<h1 /);
assert.equal(landing.match(/<h1 /g)?.length, 1);
assert.match(landing, /<h2 /);
assert.match(landing, /<ul>/);
assert.match(landing, /APP_LANDING_HERO_SRC/);
assert.match(landing, /APP_LANDING_HERO_ALT/);
assert.doesNotMatch(landing, /apps\.apple\.com|play\.google\.com|בקרוב|coming soon/i);
assert.doesNotMatch(page, /apps\.apple\.com|play\.google\.com/);
assert.match(shell, /"\/app"/);

const graph = buildAppLandingStructuredData()["@graph"] as Array<{ "@type": string }>;
assert.deepEqual(
  graph.map((node) => node["@type"]),
  ["WebSite", "Organization", "WebPage", "BreadcrumbList"]
);

assert.equal(
  existsSync(resolve(root, "public/SEO pages/anynanny banner p and b.png")),
  true
);
assert.equal(
  existsSync(resolve(root, "public/SEO pages/anynanny-app-landing-hero.png")),
  true
);
assert.equal(existsSync(resolve(root, "public/SEO pages/anynanny-app-landing-og.png")), true);

const sitemap = buildPublicSitemap();
assert.ok(sitemap.some((entry) => entry.url === "https://www.anynanny.org/app"));

console.log("app landing tests passed");
