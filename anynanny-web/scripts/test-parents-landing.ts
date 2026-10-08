import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "../app/sitemap";
import { APP_LANDING_APP_STORE_URL, APP_LANDING_GOOGLE_PLAY_URL } from "../lib/marketing/app-landing";
import {
  PARENTS_LANDING_ANNY_SRC,
  PARENTS_LANDING_APP_STORE_URL,
  PARENTS_LANDING_AVAILABILITY,
  PARENTS_LANDING_CANONICAL,
  PARENTS_LANDING_CTA,
  PARENTS_LANDING_DESCRIPTION,
  PARENTS_LANDING_GOOGLE_PLAY_URL,
  PARENTS_LANDING_H1,
  PARENTS_LANDING_HERO_ALT,
  PARENTS_LANDING_HERO_SRC,
  PARENTS_LANDING_IOS_INSTALL_NOTE,
  PARENTS_LANDING_OG_DESCRIPTION,
  PARENTS_LANDING_OG_PATH,
  PARENTS_LANDING_OG_TITLE,
  PARENTS_LANDING_OG_URL,
  PARENTS_LANDING_PATH,
  PARENTS_LANDING_RATINGS,
  PARENTS_LANDING_TITLE,
  PARENTS_LANDING_WORDMARK_SRC,
  buildParentsLandingStructuredData,
  parentsLandingSignupHref,
  parentsWebAppFallbackHref
} from "../lib/marketing/parents-landing";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(existsSync(resolve(root, "app/parents/page.tsx")), true);
assert.equal(PARENTS_LANDING_PATH, "/parents");
assert.equal(PARENTS_LANDING_CANONICAL, "https://www.anynanny.org/parents");
assert.equal(PARENTS_LANDING_H1, "AnyNanny — לא צריך לשלם כדי למצוא בייביסיטר!");
assert.equal(PARENTS_LANDING_TITLE, "AnyNanny | לא צריך לשלם כדי למצוא בייביסיטר");
assert.equal(
  PARENTS_LANDING_DESCRIPTION,
  "AnyNanny מאפשרת להורים למצוא בייביסיטר בצורה פשוטה וברורה. צפו בפרופילים, בדקו זמינות, התרשמו מדירוגים ובחרו את הבייביסיטר המתאימה למשפחה שלכם."
);
assert.equal(PARENTS_LANDING_OG_TITLE, "AnyNanny — לא צריך לשלם כדי למצוא בייביסיטר");
assert.equal(
  PARENTS_LANDING_OG_DESCRIPTION,
  "כל אפשרויות הבייביסיטר במקום אחד — פרופילים, זמינות, דירוגים ומידע שחשוב להורים."
);
assert.equal(PARENTS_LANDING_HERO_SRC, "/SEO pages/parents rest time.png");
assert.equal(PARENTS_LANDING_HERO_ALT, "AnyNanny - הורים מוצאים בייביסיטר ומתפנים לזמן זוגי");
assert.equal(PARENTS_LANDING_WORDMARK_SRC, "/brand/anynanny-official-wordmark.png");
assert.equal(PARENTS_LANDING_ANNY_SRC, "/anynanny-clean-transparent.png.jpg");
assert.equal(PARENTS_LANDING_CTA, "לחיפוש בייביסיטר");
assert.match(PARENTS_LANDING_RATINGS, /דירוגים ממשפחות אחרות/);
assert.match(PARENTS_LANDING_AVAILABILITY, /בדקו מראש/);
assert.doesNotMatch(PARENTS_LANDING_AVAILABILITY, /תמיד יש בייביסיטריות זמינות/);
assert.match(PARENTS_LANDING_IOS_INSTALL_NOTE, /הוספה למסך הבית/);
assert.equal(PARENTS_LANDING_APP_STORE_URL, "https://apps.apple.com/il/app/anynanny/id6813214477");
assert.equal(PARENTS_LANDING_APP_STORE_URL, APP_LANDING_APP_STORE_URL);
assert.equal(PARENTS_LANDING_GOOGLE_PLAY_URL, "");
assert.equal(PARENTS_LANDING_GOOGLE_PLAY_URL, APP_LANDING_GOOGLE_PLAY_URL);
assert.equal(PARENTS_LANDING_OG_PATH, "/SEO pages/parents-landing-og.png");
assert.equal(PARENTS_LANDING_OG_URL, "https://www.anynanny.org/SEO%20pages/parents-landing-og.png");

const parentHref = parentsLandingSignupHref();
assert.match(parentHref, /^\/welcome\?/);
assert.match(parentHref, /role=parent/);
assert.match(parentHref, /register/);
assert.doesNotMatch(parentHref, /role=sitter/);
assert.doesNotMatch(parentHref, /track=babysitter/);
assert.equal(parentsWebAppFallbackHref(), "/");
assert.doesNotMatch(parentsWebAppFallbackHref(), /apps\.apple\.com|play\.google/);

const page = read("app/parents/page.tsx");
const landing = read("components/marketing/parents-landing.tsx");
const install = read("components/marketing/parents-web-app-install-button.tsx");
const css = read("components/marketing/parents-landing.module.css");
const shell = read("components/app-shell-gate.tsx");

assert.match(page, /canonical: PARENTS_LANDING_CANONICAL/);
assert.match(page, /title: PARENTS_LANDING_OG_TITLE/);
assert.match(page, /card: "summary_large_image"/);
assert.match(page, /index:\s*true/);
assert.doesNotMatch(page, /noindex/);
assert.equal(landing.match(/<h1 /g)?.length, 1);
assert.match(landing, /<h2 /);
assert.match(landing, /<ul>/);
assert.match(landing, /<p>/);
assert.match(landing, /dir="rtl"/);
assert.match(landing, /AnyNannyLogo/);
assert.match(landing, /AnynannyMascotPortrait/);
assert.match(landing, /PARENTS_LANDING_HERO_SRC/);
assert.match(landing, /PARENTS_LANDING_HERO_ALT/);
assert.match(landing, /aria-label="AnyNanny ב-App Store"/);
assert.match(landing, /target="_blank"/);
assert.match(landing, /rel="noopener noreferrer"/);
assert.match(landing, /data-cta="parent-search"/);
assert.match(landing, /PARENTS_LANDING_GOOGLE_PLAY_URL \?/);
assert.doesNotMatch(landing, /play\.google\.com|apps\.apple\.com/);
assert.doesNotMatch(page, /play\.google\.com|apps\.apple\.com/);
assert.match(install, /beforeinstallprompt/);
assert.match(install, /aria-label="להתקנת AnyNanny כ-Web App"/);
assert.match(install, /deferred\.prompt\(\)/);
assert.match(install, /PARENTS_LANDING_IOS_INSTALL_NOTE/);
assert.doesNotMatch(install, /apps\.apple\.com|play\.google\.com/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /left:\s*60\.63%/);
assert.match(css, /@media \(max-width: 800px\)/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /min-height:\s*3\.25rem/);
assert.match(css, /#001f3f/);
assert.match(css, /#3a9a44/);
assert.match(shell, /"\/parents"/);

const graph = buildParentsLandingStructuredData()["@graph"] as Array<{ "@type": string }>;
assert.deepEqual(
  graph.map((node) => node["@type"]),
  ["WebSite", "Organization", "WebPage", "BreadcrumbList"]
);

assert.equal(existsSync(resolve(root, "public/SEO pages/parents rest time.png")), true);
assert.equal(existsSync(resolve(root, "public/SEO pages/parents-landing-og.png")), true);
assert.equal(existsSync(resolve(root, "public/brand/anynanny-official-wordmark.png")), true);
assert.equal(existsSync(resolve(root, "public/anynanny-clean-transparent.png.jpg")), true);

const publicSitemap = buildPublicSitemap();
assert.ok(publicSitemap.some((entry) => entry.url === "https://www.anynanny.org/parents"));
const liveSitemap = sitemap();
assert.ok(liveSitemap.some((entry) => entry.url === "https://www.anynanny.org/parents"));

console.log("parents landing tests passed");
