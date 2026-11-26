import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "../app/sitemap";
import { classifySiteRequest } from "../lib/hosts/site-classifier";
import { IPHONE_APP_STORE_URL, GOOGLE_PLAY_LISTING_URL } from "../lib/marketing/site-nav";
import {
  DOWNLOAD_CLICK_EVENT,
  DOWNLOAD_LANDING_APP_STORE_LABEL,
  DOWNLOAD_LANDING_APP_STORE_URL,
  DOWNLOAD_LANDING_CANONICAL,
  DOWNLOAD_LANDING_GOOGLE_PLAY_LABEL,
  DOWNLOAD_LANDING_GOOGLE_PLAY_URL,
  DOWNLOAD_LANDING_PATH,
  DOWNLOAD_LANDING_POSTER_HEIGHT,
  DOWNLOAD_LANDING_POSTER_SRC,
  DOWNLOAD_LANDING_POSTER_WIDTH,
  DOWNLOAD_STORE_HIT_BOXES,
  buildDownloadStoreClickEvent,
  downloadAppStoreHref,
  downloadGooglePlayHref,
  parseDownloadClickRequest
} from "../lib/marketing/parent-download";
import { isNoindexPath } from "../lib/seo/private-index";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const posterPath = resolve(root, "public", DOWNLOAD_LANDING_POSTER_SRC.replace(/^\//, ""));
assert.equal(existsSync(posterPath), true);
assert.equal(existsSync(resolve(root, "app/download/page.tsx")), true);

assert.equal(DOWNLOAD_LANDING_PATH, "/download");
assert.equal(DOWNLOAD_LANDING_CANONICAL, "https://www.anynanny.org/download");
assert.equal(DOWNLOAD_LANDING_POSTER_WIDTH, 1254);
assert.equal(DOWNLOAD_LANDING_POSTER_HEIGHT, 1254);
assert.equal(DOWNLOAD_LANDING_POSTER_WIDTH / DOWNLOAD_LANDING_POSTER_HEIGHT, 1);
assert.equal(DOWNLOAD_LANDING_APP_STORE_URL, "https://apps.apple.com/il/app/anynanny/id6813214477");
assert.equal(DOWNLOAD_LANDING_APP_STORE_URL, IPHONE_APP_STORE_URL);
assert.equal(DOWNLOAD_LANDING_GOOGLE_PLAY_URL, "https://play.google.com/store/apps/details?id=org.anynanny.app");
assert.equal(DOWNLOAD_LANDING_GOOGLE_PLAY_URL, GOOGLE_PLAY_LISTING_URL);

const apple = DOWNLOAD_STORE_HIT_BOXES.app_store;
const play = DOWNLOAD_STORE_HIT_BOXES.google_play;
assert.ok(apple.left + apple.width < play.left);
assert.ok(apple.top + apple.height < 100);
assert.ok(play.left + play.width < 100);
assert.equal(apple.top, play.top);
assert.equal(apple.height, play.height);

const campaign =
  "utm_source=facebook&utm_medium=cpc&utm_campaign=parents&utm_content=badge&utm_term=nanny&code=secret&type=recovery&access_token=abc&email=parent@example.com";
const appStoreHref = downloadAppStoreHref(campaign);
const playHref = downloadGooglePlayHref(campaign);
const appStoreUrl = new URL(appStoreHref);
const playUrl = new URL(playHref);
assert.equal(appStoreUrl.origin + appStoreUrl.pathname, "https://apps.apple.com/il/app/anynanny/id6813214477");
assert.equal(appStoreUrl.searchParams.get("utm_source"), "facebook");
assert.equal(appStoreUrl.searchParams.get("utm_medium"), "cpc");
assert.equal(appStoreUrl.searchParams.get("utm_campaign"), "parents");
assert.equal(appStoreUrl.searchParams.get("utm_content"), "badge");
assert.equal(appStoreUrl.searchParams.get("utm_term"), "nanny");
assert.equal(appStoreUrl.searchParams.get("code"), null);
assert.equal(appStoreUrl.searchParams.get("access_token"), null);
assert.equal(appStoreUrl.searchParams.get("email"), null);
assert.equal(playUrl.searchParams.get("id"), "org.anynanny.app");
assert.equal(playUrl.searchParams.get("referrer"), "utm_source=facebook&utm_medium=cpc&utm_campaign=parents&utm_content=badge&utm_term=nanny");
assert.equal(playUrl.searchParams.get("email"), null);

const appleClick = buildDownloadStoreClickEvent("app_store", campaign);
const playClick = buildDownloadStoreClickEvent("google_play", campaign);
assert.equal(appleClick.event, DOWNLOAD_CLICK_EVENT);
assert.equal(playClick.event, DOWNLOAD_CLICK_EVENT);
assert.equal(appleClick.platform, "app_store");
assert.equal(playClick.platform, "google_play");
assert.equal(appleClick.source, "facebook");
assert.equal(appleClick.medium, "cpc");
assert.equal(appleClick.campaign, "parents");
assert.equal(appleClick.content, "badge");
assert.equal(appleClick.term, "nanny");
assert.equal("email" in appleClick, false);
assert.equal("code" in appleClick, false);
assert.equal("access_token" in appleClick, false);
assert.deepEqual(buildDownloadStoreClickEvent("google_play", ""), {
  event: DOWNLOAD_CLICK_EVENT,
  platform: "google_play"
});

const parsed = parseDownloadClickRequest({
  platform: "google_play",
  search: `?${campaign}`,
  email: "parent@example.com",
  name: "Dana"
});
assert.deepEqual(parsed, playClick);
assert.equal(parseDownloadClickRequest({ platform: "web", search: campaign }), null);
assert.equal(parseDownloadClickRequest({ platform: "app_store", search: 12 }), null);
assert.equal(parseDownloadClickRequest(null), null);

const www = classifySiteRequest({
  host: "www.anynanny.org",
  pathname: "/download",
  search: "?utm_source=facebook&utm_medium=cpc&utm_campaign=parents",
  domainSeparationEnabled: true
});
assert.equal(www.pathKind, "marketing");
assert.deepEqual(www.serving, { mode: "marketing" });
const appHost = classifySiteRequest({
  host: "app.anynanny.org",
  pathname: "/download",
  search: "?utm_source=facebook&utm_medium=cpc&utm_campaign=parents",
  domainSeparationEnabled: true
});
assert.deepEqual(appHost.serving, {
  mode: "redirect-to-www",
  location: "https://www.anynanny.org/download?utm_source=facebook&utm_medium=cpc&utm_campaign=parents"
});

assert.equal(isNoindexPath("/download"), false);

const page = read("app/download/page.tsx");
const landing = read("components/marketing/parent-download-landing.tsx");
const css = read("components/marketing/parent-download-landing.module.css");
const shell = read("components/app-shell-gate.tsx");
assert.match(page, /downloadAppStoreHref/);
assert.match(page, /downloadGooglePlayHref/);
assert.doesNotMatch(page, /play\.google\.com|apps\.apple\.com/);
assert.match(landing, /DOWNLOAD_LANDING_APP_STORE_LABEL/);
assert.match(landing, /DOWNLOAD_LANDING_GOOGLE_PLAY_LABEL/);
assert.equal(DOWNLOAD_LANDING_APP_STORE_LABEL, "הורדת AnyNanny ב-App Store");
assert.equal(DOWNLOAD_LANDING_GOOGLE_PLAY_LABEL, "הורדת AnyNanny ב-Google Play");
assert.match(landing, /data-cta=\{platform === "app_store" \? "app-store" : "google-play"\}/);
assert.match(landing, /data-platform=\{platform\}/);
assert.match(landing, /left: `\$\{box\.left\}%`/);
assert.doesNotMatch(landing, /insetInlineStart|inset-inline-start/);
assert.doesNotMatch(landing, /href=\{appStoreHref\}[\s\S]*href=\{appStoreHref\}/);
assert.equal(landing.match(/<a\b/g)?.length, 1);
assert.match(landing, /<StoreHit platform="app_store"/);
assert.match(landing, /<StoreHit platform="google_play"/);
assert.match(landing, /width=\{DOWNLOAD_LANDING_POSTER_WIDTH\}/);
assert.match(landing, /height=\{DOWNLOAD_LANDING_POSTER_HEIGHT\}/);
assert.doesNotMatch(landing, /MarketingSidebar|MarketingHeader|data-marketing-portal/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /max-width:\s*100%/);
assert.match(shell, /"\/download"/);
assert.match(shell, /pathname === "\/download" \|\| pathname\.startsWith\("\/download\/"\)/);
assert.doesNotMatch(read("app/api/marketing/download-click/route.ts"), /email|cookie|authorization|user-agent/i);

assert.ok(buildPublicSitemap().some((entry) => entry.url === "https://www.anynanny.org/download"));
assert.ok(sitemap().some((entry) => entry.url === "https://www.anynanny.org/download"));

console.log("parent download landing: ok");
