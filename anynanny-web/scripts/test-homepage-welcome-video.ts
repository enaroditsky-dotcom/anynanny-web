import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WELCOME_HOMEPAGE_PLAY_LABEL,
  WELCOME_HOMEPAGE_REPLAY_LABEL,
  WELCOME_VIDEO_SRC
} from "../lib/welcome/constants";
import {
  APP_DOWNLOAD_HEADING,
  APP_DOWNLOAD_SUPPORTING_TEXT,
  STORE_DOWNLOADS,
  STORE_DOWNLOAD_SOON_LABEL,
  verifiedStoreHref
} from "../lib/app/store-downloads";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const landing = read("app/page.tsx");
const homepageVideo = read("components/welcome/homepage-welcome-video.tsx");
const welcomePlayer = read("components/welcome/welcome-video-player.tsx");
const welcomeFlow = read("components/welcome/welcome-flow-page.tsx");
const videoPath = resolve(root, "public/welcome/anynanny-welcome.mp4");

assert.equal(existsSync(videoPath), true);
assert.ok(statSync(videoPath).size > 1_000_000);
assert.equal(WELCOME_VIDEO_SRC, "/welcome/anynanny-welcome.mp4");

assert.match(landing, /HomepageWelcomeVideo/);
assert.match(landing, /AnyNannyLogo/);
assert.match(landing, /variant="hero"/);
assert.match(landing, /פשוט למצוא זמן לחיים/);
assert.doesNotMatch(landing, /AnyNannyWordmark/);
assert.doesNotMatch(landing, /צפו בסרטון קצר שמסביר איך AnyNanny/);
assert.doesNotMatch(landing, /HomePageClient/);
assert.doesNotMatch(landing, /MarketingHome/);
assert.equal(existsSync(resolve(root, "components/marketing/marketing-home.tsx")), false);
assert.equal(existsSync(resolve(root, "components/marketing/home-page-client.tsx")), false);

const wordmarkPath = resolve(root, "public/brand/anynanny-official-wordmark.png");
assert.equal(existsSync(wordmarkPath), true);
assert.ok(statSync(wordmarkPath).size > 50_000);
assert.equal(existsSync(resolve(root, "public/brand/anynanny-wordmark.jpg")), false);
assert.equal(existsSync(resolve(root, "public/brand/anynanny-wordmark.png")), false);
assert.equal(existsSync(resolve(root, "components/brand/anynanny-wordmark.tsx")), false);

const logo = read("components/brand/anynanny-logo.tsx");
assert.match(logo, /ANYNANNY_WORDMARK_SRC = "\/brand\/anynanny-official-wordmark\.png"/);
assert.match(logo, /alt=\{decorative \? "" : "AnyNanny"\}/);
assert.match(logo, /object-contain/);
assert.match(logo, /bg-transparent/);
assert.match(logo, /header:/);
assert.match(logo, /hero:/);
assert.doesNotMatch(logo, /anynanny-wordmark\.jpg/);
assert.doesNotMatch(logo, /anynanny-wordmark\.png/);
assert.doesNotMatch(logo, /<svg/);
assert.doesNotMatch(logo, /strokeWidth/);

const appHeader = read("components/app-shell-header.tsx");
assert.match(appHeader, /AnyNannyLogo/);
assert.match(appHeader, /variant="header"/);
assert.doesNotMatch(appHeader, /Any<span className="text-emerald-600">Nanny<\/span>/);

const mainLayout = read("components/layout/MainLayout.tsx");
assert.match(mainLayout, /AnyNannyLogo/);
assert.match(mainLayout, /variant="header"/);
assert.doesNotMatch(mainLayout, /text-\[#00A86B\]">Nanny/);

const signUp = read("app/auth/sign-up/page.tsx");
assert.match(signUp, /AnyNannyLogo/);
assert.match(signUp, /variant="hero"/);
assert.doesNotMatch(signUp, /darkColor/);

const verified = read("app/auth/verified/page.tsx");
assert.match(verified, /AnyNannyLogo/);
assert.match(verified, /variant="header"/);
assert.doesNotMatch(verified, /<span className="text-xl font-bold text-\[#001F3F\]">AnyNanny<\/span>/);

const login = read("app/auth/login/page.tsx");
assert.match(login, /AnyNannyLogo/);
const loginPage = read("app/login/page.tsx");
assert.match(loginPage, /isAppLoginLandingRequest/);
assert.match(loginPage, /AppLoginLanding/);
const appLoginLanding = read("components/auth/app-login-landing.tsx");
assert.match(appLoginLanding, /HomepageWelcomeVideo/);
assert.match(appLoginLanding, /landing-registration-options/);
assert.match(appLoginLanding, /חזרה לאתר AnyNanny/);
assert.match(appLoginLanding, /href="\/"/);
assert.match(appLoginLanding, /AppDownloadSection/);
assert.match(appLoginLanding, /APP_DOWNLOAD_HEADING/);
assert.match(appLoginLanding, /STORE_DOWNLOAD_SOON_LABEL/);
assert.match(appLoginLanding, /verifiedStoreHref/);
assert.match(appLoginLanding, /data-app-download-banner/);
assert.match(appLoginLanding, /bg-\[#000000\]/);
assert.match(appLoginLanding, /text-\[#FFFFFF\]/);
assert.match(appLoginLanding, /function PlatformMark/);
assert.doesNotMatch(appLoginLanding, /Smartphone/);
assert.doesNotMatch(appLoginLanding, /play\.google\.com/);
assert.doesNotMatch(appLoginLanding, /apps\.apple\.com/);
assert.equal(APP_DOWNLOAD_HEADING, "הורידו את אפליקציית AnyNanny");
assert.equal(
  APP_DOWNLOAD_SUPPORTING_TEXT,
  "גישה נוחה ל־AnyNanny מכל מקום. בחרו את המכשיר שלכם והתחילו למצוא זמן לחיים."
);
assert.equal(STORE_DOWNLOAD_SOON_LABEL, "בקרוב");
assert.equal(STORE_DOWNLOADS.map((item) => item.id).join(","), "android,iphone");
assert.equal(
  STORE_DOWNLOADS.every((item) => verifiedStoreHref(item.href) === null),
  true
);
assert.equal(
  verifiedStoreHref("https://play.google.com/store/apps/details?id=org.anynanny.app"),
  "https://play.google.com/store/apps/details?id=org.anynanny.app"
);
assert.equal(verifiedStoreHref("https://example.com/fake-app"), null);
const backIdx = appLoginLanding.indexOf("חזרה לאתר AnyNanny");
const bannerIdx = appLoginLanding.indexOf("<AppDownloadSection />");
const logoIdx = appLoginLanding.indexOf('<AnyNannyLogo variant="hero"');
const videoIdx = appLoginLanding.indexOf("<HomepageWelcomeVideo");
const loginIdx = appLoginLanding.indexOf("כניסה");
assert.ok(backIdx >= 0 && bannerIdx > backIdx && logoIdx > bannerIdx);
assert.ok(videoIdx > logoIdx && loginIdx > videoIdx);
assert.equal(appLoginLanding.split("<AppDownloadSection />").length - 1, 1);
const register = read("app/register/page.tsx");
assert.match(register, /AnyNannyLogo/);
assert.match(welcomeFlow, /AnyNannyLogo/);
assert.match(welcomeFlow, /ברוכים הבאים ל-AnyNanny/);
assert.doesNotMatch(welcomeFlow, /text-\[#B8860B\]">AnyNanny/);
const nowHero = read("components/parent/anynanny-now-hero.tsx");
assert.match(nowHero, /AnyNannyLogo/);
assert.doesNotMatch(nowHero, /text-\[#00A86B\]">Nanny/);
assert.match(landing, /welcomeSignupHref\(profileRole/);
assert.match(landing, /action === "register"/);
assert.match(landing, /router\.push\(`\/login\?\$\{qs\.toString\(\)\}`\)/);

assert.match(homepageVideo, /הכירו את AnyNanny ב־10 שניות/);
assert.doesNotMatch(homepageVideo, /צפו בסרטון קצר שמסביר איך AnyNanny/);
assert.match(homepageVideo, /רוצים להצטרף\? התחילו כאן/);
assert.match(homepageVideo, /10 שניות/);
assert.match(homepageVideo, /WELCOME_VIDEO_SRC/);
assert.match(homepageVideo, /WELCOME_HOMEPAGE_PLAY_LABEL/);
assert.match(homepageVideo, /WELCOME_HOMEPAGE_REPLAY_LABEL/);
assert.match(homepageVideo, /type="button"/);
assert.match(homepageVideo, /aria-label=\{hasEnded \? WELCOME_HOMEPAGE_REPLAY_LABEL : WELCOME_HOMEPAGE_PLAY_LABEL\}/);
assert.equal(WELCOME_HOMEPAGE_PLAY_LABEL.includes("הפעלת"), true);
assert.equal(WELCOME_HOMEPAGE_REPLAY_LABEL.includes("חוזרת"), true);

assert.doesNotMatch(homepageVideo, /import .*anynanny-welcome/);
assert.doesNotMatch(homepageVideo, /\bautoPlay\b/);
assert.doesNotMatch(homepageVideo, /muted=\{true\}/);
assert.doesNotMatch(homepageVideo, /preload="auto"/);
assert.match(homepageVideo, /preload="metadata"/);
assert.match(homepageVideo, /playsInline/);
assert.match(homepageVideo, /controls=\{hasStarted && !hasEnded\}/);

assert.doesNotMatch(welcomeFlow, /HomepageWelcomeVideo/);
assert.match(welcomePlayer, /autoPlay/);
assert.match(welcomeFlow, /WelcomeVideoPlayer/);

console.log("test-homepage-welcome-video: PASS");
