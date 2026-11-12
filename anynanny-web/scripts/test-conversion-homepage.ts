import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETING_CHAPTERS, storyAnchorFromHash, storyLocationForAnchor } from "../lib/marketing/chapters";
import {
  CONVERSION_VIDEO_BYTES,
  CONVERSION_VIDEO_SRC,
  MARKETING_HOME_CANONICAL,
  MARKETING_HOME_DESCRIPTION,
  MARKETING_HOME_TITLE,
  MARKETING_STORY_CANONICAL,
  MARKETING_STORY_DESCRIPTION,
  MARKETING_STORY_TITLE
} from "../lib/marketing/marketing-home";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const page = read("app/page.tsx");
const storyPage = read("app/story/page.tsx");
const home = read("components/marketing/conversion-home.tsx");
const story = `${read("components/marketing/marketing-home.tsx")}\n${read("components/marketing/story-app-demo.tsx")}`;
const handoff = read("components/marketing/story-chapter-handoff.tsx");
const css = read("components/marketing/conversion-home.module.css");
const application = read("components/home/application-home-page.tsx");

assert.match(page, /ConversionHome/);
assert.match(page, /ApplicationHomePage/);
assert.doesNotMatch(page, /MarketingHomePage/);
assert.match(page, /href=\{MARKETING_HOME_CANONICAL\}/);
assert.match(page, /StoryChapterHandoff/);
assert.equal(MARKETING_HOME_TITLE, "צריכים בייביסיטר? מחפשים עבודה? | AnyNanny");
assert.match(MARKETING_HOME_DESCRIPTION, /ללא דמי מנוי וללא עמלת הזמנה/);
assert.equal(MARKETING_HOME_CANONICAL, "https://www.anynanny.org/");

assert.match(home, /ANYNANNY_APP_LOGO_SRC/);
assert.ok(home.indexOf("styles.logo") < home.indexOf("<h1"));
assert.match(home, /ברוכים הבאים ל־AnyNanny!/);
assert.match(home, /נעים להכיר\. מה מביא אתכם לכאן\?/);
assert.equal((home.match(/<h1\b/g) ?? []).length, 1);
assert.match(home, /href: welcomeTopicPath\("meet"\)/);
assert.match(home, /href: welcomeTopicPath\("life"\)/);
assert.match(home, /href: welcomeTopicPath\("trust"\)/);
assert.match(home, /href: welcomeTopicPath\("preview"\)/);
assert.match(home, /href: welcomeTopicPath\("respect"\)/);
assert.match(home, /href: welcomeTopicPath\("sitters"\)/);
assert.match(home, /href: "\/parents"/);
assert.doesNotMatch(home, /href: "\/babysitter"/);
assert.match(home, /בואו להכיר את AnyNanny/);
assert.match(home, /לבייביסיטריות — מקום לעבודה הטובה שלכן/);
assert.match(home, /בואו נציץ פנימה/);
assert.match(home, /anynanny-home-family-clouds\.png/);
assert.doesNotMatch(css, /grid-template-columns/);
assert.doesNotMatch(home, /ANYNANNY-מבצעים וקופונים/);
assert.doesNotMatch(home, /הכירו את AnyNanny/);
assert.doesNotMatch(home, /איך AnyNanny עובדת/);
assert.doesNotMatch(home, /אמון והיכרות/);
assert.doesNotMatch(home, /הורדה וגישה/);
assert.doesNotMatch(home, /<video\b/);
assert.doesNotMatch(home, /CONVERSION_VIDEO_SRC/);
assert.doesNotMatch(home, /MarketingHome/);
assert.doesNotMatch(home, /play\.google\.com/);
assert.match(home, /APP_LANDING_APP_STORE_URL/);
assert.match(home, /https:\/\/app\.anynanny\.org/);
assert.match(home, /להורדה לאנדרואיד/);
assert.match(home, /דרך האפליקציה בדפדפן/);
assert.match(home, /app-store-badge-he\.svg/);
assert.doesNotMatch(css, /background-image:\s*url\([^)]*anynanny-home-family-clouds/);
assert.doesNotMatch(css, /background-size:\s*cover/);
assert.match(css, /aspect-ratio:\s*1670 \/ 941/);
assert.match(css, /-webkit-tap-highlight-color:\s*transparent/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /cloudRear/);
assert.match(home, /cloudRear/);
assert.match(home, /cloudFront/);
assert.doesNotMatch(css, /box-shadow:\s*inset 0 0 0 2px/);
assert.match(css, /:focus-visible/);
assert.doesNotMatch(css, /background-size:\s*min\(100%, 920px\) auto/);
assert.doesNotMatch(css, /background-size:\s*min\(78%, 880px\) auto/);

assert.equal(CONVERSION_VIDEO_SRC, "/marketing/video/anynanny-horizontal-1080p-caption.mp4");
const videoPath = resolve(root, "public/marketing/video/anynanny-horizontal-1080p-caption.mp4");
assert.equal(existsSync(videoPath), true);
assert.equal(statSync(videoPath).size, CONVERSION_VIDEO_BYTES);

assert.match(storyPage, /MarketingHomePage/);
assert.match(storyPage, /MARKETING_STORY_CANONICAL/);
assert.equal(MARKETING_STORY_TITLE, "הסיפור של AnyNanny");
assert.match(MARKETING_STORY_DESCRIPTION, /משפחות ובייביסיטריות נפגשות/);
assert.equal(MARKETING_STORY_CANONICAL, "https://www.anynanny.org/story");
assert.match(story, /id="home"/);
assert.match(story, /id="together"/);
for (const chapter of MARKETING_CHAPTERS) {
  assert.match(story, new RegExp(`id="${chapter.id}"`));
}

assert.equal(storyAnchorFromHash("#parents"), "parents");
assert.equal(storyAnchorFromHash("#charters"), "charters");
assert.equal(storyAnchorFromHash("#access_token=abc"), null);
assert.equal(storyLocationForAnchor("parents", "?utm_source=ig"), "/story?utm_source=ig#parents");
assert.match(handoff, /storyAnchorFromHash/);
assert.match(handoff, /location\.replace/);

const urls = buildPublicSitemap().map((entry) => entry.url);
assert.equal(urls.includes("https://www.anynanny.org/story"), true);
assert.equal(urls.includes("https://www.anynanny.org/"), true);
assert.equal(urls.includes("https://www.anynanny.org/parents"), true);
assert.equal(urls.includes("https://www.anynanny.org/babysitter"), true);

assert.match(application, /HomepageWelcomeVideo/);
assert.match(application, /restoreHomeSession/);
assert.doesNotMatch(application, /ConversionHome|MarketingHomePage/);

const topicPage = read("components/marketing/welcome-topic-page.tsx");
const topicCss = read("components/marketing/welcome-topic-page.module.css");
const preview = read("components/marketing/preview-role-demos.tsx");
const parents = read("components/marketing/parents-landing.tsx");
assert.match(topicPage, /MarketingHomeReturn/);
assert.match(read("components/marketing/marketing-home-return.tsx"), /חזרה לדף הבית/);
assert.match(read("components/marketing/marketing-home-return.tsx"), /href="\/"/);
assert.doesNotMatch(topicPage, /חזרה למפת הבית/);
assert.match(topicCss, /grid-template-columns:\s*minmax\(0, 1\.15fr\) minmax\(15rem, 0\.85fr\)/);
assert.match(topicPage, /styles\.sittersArt/);
assert.match(preview, /role=parent/);
assert.match(preview, /role=sitter/);
assert.match(preview, /הורים/);
assert.match(preview, /בייביסיטריות/);
assert.match(parents, /MarketingHomeReturn/);
assert.match(parents, /data-cta="parent-search"/);

console.log("conversion homepage: ok");
