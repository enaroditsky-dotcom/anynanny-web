import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOMAIN_SEPARATION_ENABLED,
  WWW_MARKETING_ROOT_ENABLED
} from "../lib/hosts/site-classifier";
import { resolveRootEntry } from "../lib/hosts/root-entry";
import { generalWebAppHref } from "../lib/marketing/general-acquisition";
import {
  MARKETING_HOME_DESCRIPTION,
  MARKETING_HOME_TITLE
} from "../lib/marketing/marketing-home";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

function scan(dir: string, extensions: Set<string>, hits: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "build" || entry === ".dart_tool" || entry === "Pods") continue;
    const path = join(dir, entry);
    let info: ReturnType<typeof statSync>;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      scan(path, extensions, hits);
      continue;
    }
    if (!extensions.has(extname(entry))) continue;
    const text = readFileSync(path, "utf8");
    if (/WKWebView|InAppWebView|anynanny\.org/i.test(text)) hits.push(path);
  }
}

assert.equal(DOMAIN_SEPARATION_ENABLED, true);
assert.equal(WWW_MARKETING_ROOT_ENABLED, true);

assert.equal(resolveRootEntry({ host: "www.anynanny.org" }), "marketing");
assert.equal(resolveRootEntry({ host: "app.anynanny.org" }), "application");
assert.equal(
  resolveRootEntry({
    host: "www.anynanny.org",
    domainSeparationEnabled: true,
    wwwMarketingRootEnabled: true
  }),
  "marketing"
);
assert.equal(
  resolveRootEntry({
    host: "app.anynanny.org",
    domainSeparationEnabled: true,
    wwwMarketingRootEnabled: true
  }),
  "application"
);
assert.equal(
  resolveRootEntry({
    host: "www.anynanny.org",
    search: "?type=recovery",
    domainSeparationEnabled: true,
    wwwMarketingRootEnabled: true
  }),
  "application"
);
assert.equal(
  resolveRootEntry({
    host: "localhost:3000",
    domainSeparationEnabled: true,
    wwwMarketingRootEnabled: true
  }),
  "application"
);
assert.equal(
  resolveRootEntry({
    host: "www.anynanny.org",
    domainSeparationEnabled: false,
    wwwMarketingRootEnabled: true
  }),
  "application"
);

const enabled = {
  domainSeparationEnabled: true,
  wwwMarketingRootEnabled: true
};
assert.equal(
  generalWebAppHref("?utm_source=ig&utm_medium=cpc&type=recovery", false),
  "/?utm_source=ig&utm_medium=cpc"
);
assert.equal(
  generalWebAppHref("?utm_source=ig&utm_medium=cpc&type=recovery"),
  "https://app.anynanny.org/?utm_source=ig&utm_medium=cpc"
);
const openApp = new URL(generalWebAppHref("?utm_source=ig&utm_medium=cpc&type=recovery", true));
assert.equal(openApp.origin, "https://app.anynanny.org");
assert.equal(openApp.pathname, "/");
assert.equal(openApp.searchParams.get("utm_source"), "ig");
assert.equal(openApp.searchParams.get("utm_medium"), "cpc");
assert.equal(openApp.searchParams.get("type"), null);

const page = read("app/page.tsx");
const marketing = read("components/marketing/marketing-home-page.tsx");
const story = read("components/marketing/marketing-home.tsx");
const application = read("components/home/application-home-page.tsx");
const rootEntry = read("lib/hosts/root-entry.ts");
assert.match(page, /resolveRootEntry/);
assert.match(page, /DOMAIN_SEPARATION_ENABLED/);
assert.match(page, /WWW_MARKETING_ROOT_ENABLED/);
assert.equal(MARKETING_HOME_TITLE, "צריכים בייביסיטר? מחפשים עבודה? | AnyNanny");
assert.match(MARKETING_HOME_DESCRIPTION, /ללא דמי מנוי וללא עמלת הזמנה/);
assert.match(page, /href=\{MARKETING_HOME_CANONICAL\}/);
assert.match(marketing, /openAppHref/);
assert.match(story, /data-app-move-notice/);
assert.match(story, /כניסה לאפליקציה/);
assert.match(story, /href=\{openAppHref\}/);
assert.doesNotMatch(story, /getParentOnboardingGateRedirect|getSitterOnboardingGateRedirect|getSupabaseBrowserClient/);
assert.doesNotMatch(marketing, /getParentOnboardingGateRedirect|getSitterOnboardingGateRedirect/);
assert.match(application, /HomepageWelcomeVideo/);
assert.match(application, /restoreHomeSession/);
assert.match(application, /welcomeSignupHref\(profileRole/);
assert.match(application, /router\.push\(`\/login\?\$\{qs\.toString\(\)\}`\)/);
assert.doesNotMatch(rootEntry, /userAgent|user-agent|WebView/);
assert.equal(rootEntry.includes("process.env"), false);

const pubspec = readFileSync(resolve(repoRoot, "pubspec.yaml"), "utf8");
const mainDart = readFileSync(resolve(repoRoot, "lib/main.dart"), "utf8");
assert.match(pubspec, /^version: 1\.0\.0\+1/m);
assert.doesNotMatch(mainDart, /WebView|WKWebView|anynanny\.org/i);
assert.match(mainDart, /WelcomeScreen/);

const nativeHits: string[] = [];
scan(resolve(repoRoot, "ios"), new Set([".swift", ".m", ".plist"]), nativeHits);
scan(resolve(repoRoot, "android"), new Set([".kt", ".xml"]), nativeHits);
scan(resolve(repoRoot, "lib"), new Set([".dart"]), nativeHits);
assert.deepEqual(nativeHits, []);

console.log("www marketing home: ok");
