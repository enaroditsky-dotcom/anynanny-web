import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETING_CHAPTERS } from "../lib/marketing/chapters";
import { MARKETING_SHOTS } from "../lib/marketing/assets";
import {
  MARKETING_ABOUT,
  MARKETING_APP,
  MARKETING_COMMUNITY,
  MARKETING_FOUNDER,
  MARKETING_HOME_PARAGRAPHS,
  MARKETING_PARENTS,
  MARKETING_PROFILE,
  MARKETING_RESPECT,
  MARKETING_SITTERS,
  MARKETING_SLOGAN,
  MARKETING_TOGETHER
} from "../lib/marketing/copy";
import {
  MARKETING_PARENT_CHARTER,
  MARKETING_SITTER_CHARTER
} from "../lib/marketing/charters";
import { ACCOUNT_TYPE_ENTRY_HREF } from "../lib/auth/age-eligibility";
import { shouldForwardRootAuthCallback } from "../lib/auth/root-auth-callback";
import { computeChapterScrollTop } from "../lib/marketing/chapter-scroll";
import { prepareMarketingAnalyticsUrl } from "../lib/marketing/analytics";
import { isAppLoginLandingRequest } from "../lib/auth/password-reset";
import {
  APP_ENTRY_HREF,
  COMING_SOON_LABEL,
  MARKETING_SITE_NAV_ID,
  ORG_NAV_CHAPTERS,
  SITE_NAV_DOWNLOADS,
  SITE_NAV_ITEMS,
  collectDestinations,
  destinationHref,
  isProtectedFaqHref
} from "../lib/marketing/site-nav";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const approved = read("anynanny-marketing-handoff/approved-copy.he.md");
const home = read("components/marketing/marketing-home.tsx");
const client = read("components/marketing/home-page-client.tsx");
const css = read("components/marketing/marketing-home.module.css");
const page = read("app/page.tsx");
const heart = read("components/marketing/marketing-heart.tsx");
const layout = read("app/layout.tsx");

function assertApproved(text: string) {
  assert.ok(approved.includes(text), `missing from approved copy: ${text.slice(0, 48)}`);
}

for (const paragraph of MARKETING_HOME_PARAGRAPHS) assertApproved(paragraph);
for (const paragraph of MARKETING_ABOUT.paragraphs) assertApproved(paragraph);
for (const paragraph of MARKETING_FOUNDER.paragraphs) assertApproved(paragraph);
for (const paragraph of MARKETING_COMMUNITY.paragraphs) assertApproved(paragraph);
for (const paragraph of MARKETING_PARENTS.paragraphs) assertApproved(paragraph);
for (const paragraph of MARKETING_SITTERS.paragraphs) assertApproved(paragraph);
for (const paragraph of MARKETING_APP.paragraphs) assertApproved(paragraph);
for (const paragraph of MARKETING_RESPECT.lead) assertApproved(paragraph);
for (const paragraph of MARKETING_RESPECT.closing) assertApproved(paragraph);
for (const paragraph of MARKETING_PROFILE.paragraphs) assertApproved(paragraph);
for (const paragraph of MARKETING_TOGETHER.paragraphs) assertApproved(paragraph);
assertApproved(MARKETING_SLOGAN);
assertApproved(MARKETING_TOGETHER.signature);
assertApproved(MARKETING_TOGETHER.comingSoon);
assertApproved(MARKETING_PARENT_CHARTER.title);
assertApproved(MARKETING_SITTER_CHARTER.title);
assertApproved("אין להפתיע את הבייביסיטר עם תנאים שונים באופן מהותי ממה שסוכם.");
assertApproved("כך אנחנו בונים יחד קהילה שאפשר לסמוך עליה.");

for (const chapter of MARKETING_CHAPTERS) {
  assert.match(home, new RegExp(`id="${chapter.id}"`));
}

assert.match(home, /HomepageWelcomeVideo/);
assert.match(home, /variant="hero"/);
assert.match(heart, /אהבתי את AnyNanny/);
assert.match(heart, /aria-pressed/);
assert.doesNotMatch(home, /<form/);
assert.doesNotMatch(home, /<textarea/);
assert.doesNotMatch(heart, /<input/);
assert.doesNotMatch(css, /scroll-snap/);
assert.match(css, /prefers-reduced-motion/);
assert.match(read("components/marketing/use-chapter-navigation.ts"), /prefers-reduced-motion/);
assert.match(css, /--marketing-font: Arial/);
assert.doesNotMatch(layout, /dir="rtl"/);

assert.match(client, /manual"\) === "true"/);
assert.match(client, /active_role/);
assert.match(client, /if \(!user\) return;/);
assert.doesNotMatch(client, /\/login\?role=parent/);
assert.doesNotMatch(client, /\/login\?role=sitter/);
assert.match(client, /welcomeSignupHref\(profileRole/);
assert.match(client, /track: "babysitter"/);
assert.equal(ACCOUNT_TYPE_ENTRY_HREF, "/login?manual=true");
assert.match(read("components/marketing/marketing-header.tsx"), /href="\/login"/);
assert.match(read("components/marketing/marketing-header.tsx"), /MARKETING_TOGETHER\.loginLabel/);
assert.doesNotMatch(read("components/marketing/marketing-header.tsx"), /registerLabel/);
assert.match(home, /href="\/login"/);
assert.match(home, /MARKETING_TOGETHER\.registerLabel/);
assert.match(read("components/auth/app-login-landing.tsx"), /HomepageWelcomeVideo/);
assert.match(read("components/auth/app-login-landing.tsx"), /כניסת \{path\.title\}/);
assert.match(read("app/login/page.tsx"), /isAppLoginLandingRequest/);
assert.match(read("app/login/page.tsx"), /AppLoginLanding/);
assert.equal(isAppLoginLandingRequest({}), true);
assert.equal(isAppLoginLandingRequest({ manual: "true" }), true);
assert.equal(isAppLoginLandingRequest({ role: "parent" }), false);
assert.equal(isAppLoginLandingRequest({ next: "/parent/calendar" }), false);
assert.equal(
  shouldForwardRootAuthCallback("/", { get: (name) => (name === "type" ? "recovery" : null) }),
  true
);
assert.equal(
  shouldForwardRootAuthCallback("/", { get: () => null }),
  false
);

assert.match(page, /export const metadata/);
assert.match(page, /HomePageClient/);
assert.match(home, /ANYNANNY_SUPPORT_EMAIL/);
assert.match(home, /href="\/privacy"/);

for (const shot of Object.values(MARKETING_SHOTS)) {
  const disk = resolve(root, `public${shot.src}`);
  assert.equal(existsSync(disk), true, shot.src);
  assert.ok(statSync(disk).size > 1000, shot.src);
}

const shortTop = computeChapterScrollTop({
  scrollY: 0,
  headerHeight: 80,
  viewportHeight: 800,
  contentTop: 400,
  contentHeight: 200,
  headingTop: 400,
  maxScroll: 4000
});
assert.equal(shortTop, 60);

const longTop = computeChapterScrollTop({
  scrollY: 1000,
  headerHeight: 80,
  viewportHeight: 800,
  contentTop: 200,
  contentHeight: 2000,
  headingTop: 200,
  gap: 24,
  maxScroll: 8000
});
assert.equal(longTop, 1096);

assert.equal(prepareMarketingAnalyticsUrl("https://anynanny.org/?manual=true#about"), "https://anynanny.org/");
assert.equal(prepareMarketingAnalyticsUrl("http://localhost:3000/"), null);
assert.equal(prepareMarketingAnalyticsUrl("https://anynanny.org/?type=recovery"), null);
assert.equal(prepareMarketingAnalyticsUrl("https://anynanny.org/parent/dashboard"), null);
assert.equal(prepareMarketingAnalyticsUrl("https://anynanny-web-git-main.vercel.app/"), null);

const sidebar = read("components/marketing/marketing-sidebar.tsx");
const siteNavSource = read("lib/marketing/site-nav.ts");
const header = read("components/marketing/marketing-header.tsx");

assert.match(home, /MarketingSidebar/);
assert.match(home, /useChapterNavigation/);
assert.match(css, /left: 0/);
assert.match(css, /overflow-y: auto/);
assert.match(css, /padding-left: var\(--marketing-sidebar-width\)/);
assert.match(css, /translateX\(-110%\)/);
assert.doesNotMatch(css, /scroll-snap/);
assert.match(sidebar, /from "lucide-react"/);
assert.match(sidebar, /aria-expanded/);
assert.match(header, /aria-expanded/);
assert.match(header, /aria-controls=\{MARKETING_SITE_NAV_ID\}/);
assert.equal(MARKETING_SITE_NAV_ID, "marketing-site-nav");
assert.match(sidebar, /id=\{MARKETING_SITE_NAV_ID\}/);
assert.equal(APP_ENTRY_HREF, "/login");
assert.equal(COMING_SOON_LABEL, "בקרוב");
assert.equal(ORG_NAV_CHAPTERS.length, MARKETING_CHAPTERS.length);
assert.match(siteNavSource, /MARKETING_CHAPTERS\.map/);
assert.equal(
  ORG_NAV_CHAPTERS.every((item) => item.icon == null),
  true
);

for (const [index, chapter] of MARKETING_CHAPTERS.entries()) {
  assert.equal(ORG_NAV_CHAPTERS[index]?.destination.kind, "chapter");
  if (ORG_NAV_CHAPTERS[index]?.destination.kind === "chapter") {
    assert.equal(ORG_NAV_CHAPTERS[index].destination.chapterId, chapter.id);
  }
  assert.equal(ORG_NAV_CHAPTERS[index]?.label, chapter.navLabel);
}

assert.doesNotMatch(sidebar, /navLabel: "/);
assert.match(sidebar, /data-org-chapters/);
assert.match(sidebar, /sidebarSearchToggle/);
assert.match(css, /sidebarOrgPanel/);
assert.match(css, /border-right: 2px solid rgba\(22, 91, 115/);
assert.doesNotMatch(sidebar, /play\.google\.com|apps\.apple\.com/);
assert.doesNotMatch(home, /play\.google\.com|apps\.apple\.com/);

assert.match(siteNavSource, /AnyNanny\.org/);
assert.match(siteNavSource, /AnyNanny\.app/);
assert.match(siteNavSource, /קהילת AnyNanny/);
assert.match(siteNavSource, /פורום AnyNanny/);
assert.match(siteNavSource, /AnyNanny Marketplace/);
assert.match(siteNavSource, /AnyNanny BUY/);
assert.match(siteNavSource, /למסירה \/ מכירה/);
assert.match(siteNavSource, /מידע ושירות/);
assert.match(siteNavSource, /מרכז ידע/);
assert.match(siteNavSource, /בטיחות ואמון/);
assert.match(siteNavSource, /מה חדש ב־AnyNanny/);
assert.match(siteNavSource, /עזרה ותמיכה/);
assert.doesNotMatch(sidebar, /\/parent\/faq/);
assert.doesNotMatch(sidebar, /\/sitter\/faq/);

const navDestinations = [
  ...collectDestinations(SITE_NAV_ITEMS),
  ...SITE_NAV_DOWNLOADS.map((item) => item.destination)
];
for (const destination of navDestinations) {
  const href = destinationHref(destination);
  if (href) {
    assert.equal(isProtectedFaqHref(href), false);
    assert.notEqual(href, "#");
  } else {
    assert.equal(destination.kind, "soon");
  }
}

assert.equal(
  SITE_NAV_DOWNLOADS.every((item) => item.destination.kind === "soon"),
  true
);
assert.match(read("components/marketing/use-chapter-navigation.ts"), /window\.scrollTo/);

console.log("test-marketing-homepage: PASS");
