import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WELCOME_HOMEPAGE_PLAY_LABEL,
  WELCOME_HOMEPAGE_REPLAY_LABEL,
  WELCOME_VIDEO_SRC
} from "../lib/welcome/constants";

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

const wordmarkPath = resolve(root, "public/brand/anynanny-wordmark.png");
assert.equal(existsSync(wordmarkPath), true);
assert.ok(statSync(wordmarkPath).size > 50_000);
assert.equal(existsSync(resolve(root, "public/brand/anynanny-wordmark.jpg")), false);
assert.equal(existsSync(resolve(root, "components/brand/anynanny-wordmark.tsx")), false);

const logo = read("components/brand/anynanny-logo.tsx");
assert.match(logo, /ANYNANNY_WORDMARK_SRC = "\/brand\/anynanny-wordmark\.png"/);
assert.match(logo, /alt=\{decorative \? "" : "AnyNanny"\}/);
assert.match(logo, /object-contain/);
assert.match(logo, /bg-transparent/);
assert.match(logo, /header:/);
assert.match(logo, /hero:/);
assert.doesNotMatch(logo, /anynanny-wordmark\.jpg/);
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
