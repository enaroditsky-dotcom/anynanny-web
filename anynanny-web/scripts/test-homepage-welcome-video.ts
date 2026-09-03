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
assert.match(landing, /welcomeSignupHref\(profileRole/);
assert.match(landing, /action === "register"/);
assert.match(landing, /router\.push\(`\/login\?\$\{qs\.toString\(\)\}`\)/);

assert.match(homepageVideo, /הכירו את AnyNanny ב־10 שניות/);
assert.match(homepageVideo, /צפו בסרטון קצר שמסביר איך AnyNanny/);
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
