import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";
import {
  GENERAL_ACQUISITION_ANNY_ALT,
  GENERAL_ACQUISITION_ANNY_SRC,
  GENERAL_ACQUISITION_CANONICAL,
  GENERAL_ACQUISITION_DESCRIPTION,
  GENERAL_ACQUISITION_DIRECT,
  GENERAL_ACQUISITION_DIFFERENTIATOR,
  GENERAL_ACQUISITION_H1,
  GENERAL_ACQUISITION_H1_FIND,
  GENERAL_ACQUISITION_H1_WORK,
  GENERAL_ACQUISITION_HERO_ALT,
  GENERAL_ACQUISITION_HERO_SRC,
  GENERAL_ACQUISITION_LOGO_URL,
  GENERAL_ACQUISITION_PARENT_COPY,
  GENERAL_ACQUISITION_PARENT_DEMO_CTA,
  GENERAL_ACQUISITION_PARENT_HEADING,
  GENERAL_ACQUISITION_PATH,
  GENERAL_ACQUISITION_SITTER_COPY,
  GENERAL_ACQUISITION_SITTER_DEMO_CTA,
  GENERAL_ACQUISITION_SITTER_HEADING,
  GENERAL_ACQUISITION_STORE_NOTE,
  GENERAL_ACQUISITION_STUDENT_JOBS_HREF,
  GENERAL_ACQUISITION_STUDENT_JOBS_LABEL,
  GENERAL_ACQUISITION_TITLE,
  GENERAL_ACQUISITION_WEB_APP_CTA,
  GENERAL_ACQUISITION_WORDMARK_ALT,
  GENERAL_ACQUISITION_WORDMARK_SRC,
  GENERAL_WEB_APP_PATH,
  buildGeneralAcquisitionStructuredData,
  generalParentDemoHref,
  generalSitterDemoHref,
  generalWebAppHref,
  utmSearchFromRecord
} from "../lib/marketing/general-acquisition";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(existsSync(resolve(root, "app/babysitter/page.tsx")), true);
assert.equal(GENERAL_ACQUISITION_PATH, "/babysitter");

const page = read("app/babysitter/page.tsx");
const landing = read("components/marketing/general-acquisition-landing.tsx");
const css = read("components/marketing/general-acquisition-landing.module.css");
const shell = read("components/app-shell-gate.tsx");

assert.equal(GENERAL_ACQUISITION_H1, "מחפשים בייביסיטר? מחפשת עבודה כבייביסיטר?");
assert.equal(`${GENERAL_ACQUISITION_H1_FIND} ${GENERAL_ACQUISITION_H1_WORK}`, GENERAL_ACQUISITION_H1);
assert.match(landing, /<h1 /);
assert.equal((landing.match(/<h1[\s>]/g) || []).length, 1);
assert.equal((page.match(/<h1[\s>]/g) || []).length, 0);
assert.match(landing, /GENERAL_ACQUISITION_H1_FIND/);
assert.match(landing, /GENERAL_ACQUISITION_H1_WORK/);

assert.equal(GENERAL_ACQUISITION_DIFFERENTIATOR, "בלי מנוי כדי לראות. בלי תשלום כדי לפנות.");
assert.match(landing, /בלי מנוי/);
assert.match(landing, /כדי לראות/);
assert.match(landing, /בלי תשלום/);
assert.match(landing, /כדי לפנות/);
assert.match(css, /\.red\s*\{[^}]*color:\s*var\(--acq-red\)/);
assert.match(css, /\.navy\s*\{[^}]*color:\s*var\(--acq-navy\)/);

assert.equal(GENERAL_ACQUISITION_DIRECT, "הורים ובייביסיטריות נפגשים כאן ישירות.");
assert.match(landing, /GENERAL_ACQUISITION_DIRECT/);
assert.match(css, /\.direct\s*\{[^}]*color:\s*var\(--acq-green\)/);

assert.equal(GENERAL_ACQUISITION_WEB_APP_CTA, "להורדת Web App");
assert.notEqual(GENERAL_ACQUISITION_WEB_APP_CTA, "הורדת Web App");
assert.match(landing, /GENERAL_ACQUISITION_WEB_APP_CTA/);
assert.match(landing, /data-cta="web-app"/);
assert.match(landing, /href=\{webAppHref\}/);

assert.equal(GENERAL_ACQUISITION_PARENT_DEMO_CTA, "אני מחפש/ת בייביסיטר — דמו");
assert.equal(GENERAL_ACQUISITION_SITTER_DEMO_CTA, "אני רוצה לעבוד כבייביסיטר — דמו");
assert.match(landing, /data-cta="parent-demo"/);
assert.match(landing, /href=\{parentDemoHref\}/);
assert.match(landing, /GENERAL_ACQUISITION_PARENT_DEMO_CTA/);
assert.match(landing, /data-cta="sitter-demo"/);
assert.match(landing, /href=\{sitterDemoHref\}/);
assert.match(landing, /GENERAL_ACQUISITION_SITTER_DEMO_CTA/);

assert.equal(GENERAL_ACQUISITION_PARENT_HEADING, "חיפוש בייביסיטר בחינם ובקלות");
assert.equal(
  GENERAL_ACQUISITION_PARENT_COPY,
  "מחפשים בייביסיטר לילדים, מטפלת או עזרה אחרי הגן, בית הספר או הצהרון? ב־AnyNanny אפשר למצוא בייביסיטריות באזור שלכם, לצפות בפרופילים, בזמינות ובתעריפים ולפנות ישירות."
);
assert.equal(GENERAL_ACQUISITION_SITTER_HEADING, "מחפשת עבודה כבייביסיטר?");
assert.equal(
  GENERAL_ACQUISITION_SITTER_COPY,
  "צרי פרופיל, סמני מתי את זמינה, הגדירי תעריף וקבלי פניות ממשפחות שמחפשות בייביסיטר או מטפלת לילדים באזור שלך."
);
assert.match(landing, /GENERAL_ACQUISITION_PARENT_COPY/);
assert.match(landing, /GENERAL_ACQUISITION_SITTER_COPY/);

assert.equal(GENERAL_ACQUISITION_TITLE, "מחפשים בייביסיטר או עבודה כבייביסיטר? | AnyNanny");
assert.equal(
  GENERAL_ACQUISITION_DESCRIPTION,
  "מחפשים בייביסיטר באזור שלכם או עבודה כבייביסיטר? AnyNanny מחברת בין הורים לבייביסיטריות ישירות, בלי מנוי כדי לראות ובלי תשלום כדי לפנות."
);
assert.equal(GENERAL_ACQUISITION_CANONICAL, "https://www.anynanny.org/babysitter");
assert.match(page, /title: GENERAL_ACQUISITION_TITLE/);
assert.match(page, /description: GENERAL_ACQUISITION_DESCRIPTION/);
assert.match(page, /canonical: GENERAL_ACQUISITION_CANONICAL/);
assert.match(page, /index:\s*true/);
assert.match(page, /follow:\s*true/);
assert.doesNotMatch(page, /noindex/);
assert.doesNotMatch(landing, /noindex/);

assert.equal(GENERAL_ACQUISITION_STORE_NOTE, "האפליקציות בחנויות — בקרוב");
assert.match(landing, /GENERAL_ACQUISITION_STORE_NOTE/);
assert.doesNotMatch(landing, /play\.google\.com/);
assert.doesNotMatch(landing, /apps\.apple\.com/);
assert.doesNotMatch(page, /play\.google\.com/);
assert.doesNotMatch(page, /apps\.apple\.com/);
assert.doesNotMatch(landing, /<a[^>]*store/i);

const structured = buildGeneralAcquisitionStructuredData();
const graph = structured["@graph"] as Array<Record<string, unknown>>;
const types = graph.map((node) => node["@type"]);
assert.ok(types.includes("WebPage"));
assert.ok(types.includes("WebSite"));
assert.ok(types.includes("Organization"));
assert.ok(types.includes("BreadcrumbList"));
assert.equal(types.includes("JobPosting"), false);
assert.equal(types.includes("LocalBusiness"), false);
assert.doesNotMatch(JSON.stringify(structured), /JobPosting|AggregateRating|Review/);
const organization = graph.find((node) => node["@type"] === "Organization");
assert.ok(organization);
assert.equal(organization.name, "AnyNanny");
assert.equal(organization.url, "https://www.anynanny.org");
assert.equal(organization.logo, GENERAL_ACQUISITION_LOGO_URL);
assert.equal(organization.logo, "https://www.anynanny.org/brand/anynanny-official-wordmark.png");
assert.match(page, /buildGeneralAcquisitionStructuredData/);
assert.doesNotMatch(page, /JobPosting/);
assert.doesNotMatch(landing, /JobPosting/);

assert.equal(GENERAL_ACQUISITION_WORDMARK_ALT, "AnyNanny - אפליקציה למציאת בייביסיטר ועבודה בבייביסיטר");
assert.equal(GENERAL_ACQUISITION_ANNY_ALT, "Anny - הדמות של AnyNanny");
assert.equal(
  GENERAL_ACQUISITION_HERO_ALT,
  "AnyNanny - חיפוש בייביסיטר ועבודה כבייביסיטר למשפחות ולמטפלות"
);
assert.match(landing, /GENERAL_ACQUISITION_WORDMARK_ALT/);
assert.match(landing, /GENERAL_ACQUISITION_ANNY_ALT/);
assert.match(landing, /GENERAL_ACQUISITION_HERO_ALT/);
assert.match(landing, /<img/);
assert.equal(existsSync(resolve(root, `public${GENERAL_ACQUISITION_WORDMARK_SRC}`)), true);
assert.equal(existsSync(resolve(root, `public${GENERAL_ACQUISITION_ANNY_SRC}`)), true);
assert.equal(
  existsSync(resolve(root, "public/SEO pages/anynanny-babysitter-parent-sitter-app.png")),
  true
);
assert.equal(GENERAL_ACQUISITION_HERO_SRC, "/SEO pages/anynanny-babysitter-parent-sitter-app.png");

assert.equal(GENERAL_ACQUISITION_STUDENT_JOBS_HREF, "/jobs/students");
assert.equal(GENERAL_ACQUISITION_STUDENT_JOBS_LABEL, "עבודה בבייביסיטר לסטודנטיות");
assert.match(landing, /GENERAL_ACQUISITION_STUDENT_JOBS_HREF/);
assert.match(landing, /GENERAL_ACQUISITION_STUDENT_JOBS_LABEL/);

assert.match(page, /generalParentDemoHref/);
assert.match(page, /generalSitterDemoHref/);
assert.doesNotMatch(page, /generalParentDemoHref\("sitter"|generalSitterDemoHref\("parent"/);
assert.match(shell, /"\/babysitter"/);
assert.match(landing, /dir="rtl"/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /min-height:\s*3\.25rem/);
assert.match(css, /@media \(max-width: 430px\)/);
assert.match(css, /#3a9a44/);
assert.match(css, /#001f3f/);

const sitemap = buildPublicSitemap();
const babysitterEntry = sitemap.find((entry) => entry.url === "https://www.anynanny.org/babysitter");
assert.ok(babysitterEntry);
assert.equal(babysitterEntry.changeFrequency, "weekly");
assert.equal(babysitterEntry.priority, 0.9);
assert.ok(sitemap.some((entry) => entry.url === "https://www.anynanny.org/jobs/students"));

assert.equal(GENERAL_WEB_APP_PATH, "/");

const plainWeb = new URL(generalWebAppHref(), "https://www.anynanny.org");
assert.equal(plainWeb.pathname, "/");
assert.equal(plainWeb.search, "");

const webWithUtm = new URL(
  generalWebAppHref(
    "utm_source=facebook&utm_medium=cpc&utm_campaign=babysitter&utm_content=hero&utm_term=nanny&code=secret&type=recovery&access_token=abc&refresh_token=xyz&unrelated=drop"
  ),
  "https://www.anynanny.org"
);
assert.equal(webWithUtm.pathname, "/");
assert.equal(webWithUtm.searchParams.get("utm_source"), "facebook");
assert.equal(webWithUtm.searchParams.get("utm_medium"), "cpc");
assert.equal(webWithUtm.searchParams.get("utm_campaign"), "babysitter");
assert.equal(webWithUtm.searchParams.get("utm_content"), "hero");
assert.equal(webWithUtm.searchParams.get("utm_term"), "nanny");
assert.equal(webWithUtm.searchParams.get("code"), null);
assert.equal(webWithUtm.searchParams.get("type"), null);
assert.equal(webWithUtm.searchParams.get("access_token"), null);
assert.equal(webWithUtm.searchParams.get("refresh_token"), null);
assert.equal(webWithUtm.searchParams.has("unrelated"), false);
assert.equal(webWithUtm.searchParams.get("role"), null);

const parentDemo = new URL(
  generalParentDemoHref(
    "utm_source=facebook&utm_medium=cpc&utm_campaign=babysitter&utm_content=hero&utm_term=nanny&code=secret&type=recovery&access_token=abc&refresh_token=xyz"
  ),
  "https://www.anynanny.org"
);
assert.equal(parentDemo.pathname, "/marketing/demo/index.html");
assert.equal(parentDemo.searchParams.get("role"), "parent");
assert.notEqual(parentDemo.searchParams.get("role"), "sitter");
assert.equal(parentDemo.searchParams.get("utm_source"), "facebook");
assert.equal(parentDemo.searchParams.get("utm_medium"), "cpc");
assert.equal(parentDemo.searchParams.get("utm_campaign"), "babysitter");
assert.equal(parentDemo.searchParams.get("utm_content"), "hero");
assert.equal(parentDemo.searchParams.get("utm_term"), "nanny");
assert.equal(parentDemo.searchParams.get("code"), null);
assert.equal(parentDemo.searchParams.get("type"), null);
assert.equal(parentDemo.searchParams.get("access_token"), null);
assert.equal(parentDemo.searchParams.get("refresh_token"), null);
assert.doesNotMatch(parentDemo.toString(), /role=sitter/);

const sitterDemo = new URL(
  generalSitterDemoHref("utm_source=instagram&utm_medium=story&code=secret&type=recovery"),
  "https://www.anynanny.org"
);
assert.equal(sitterDemo.pathname, "/marketing/demo/index.html");
assert.equal(sitterDemo.searchParams.get("role"), "sitter");
assert.notEqual(sitterDemo.searchParams.get("role"), "parent");
assert.equal(sitterDemo.searchParams.get("utm_source"), "instagram");
assert.equal(sitterDemo.searchParams.get("utm_medium"), "story");
assert.equal(sitterDemo.searchParams.get("code"), null);
assert.equal(sitterDemo.searchParams.get("type"), null);
assert.doesNotMatch(sitterDemo.toString(), /role=parent/);

const fromRecord = generalWebAppHref(
  utmSearchFromRecord({
    utm_source: "instagram",
    utm_medium: ["reel"],
    utm_campaign: "babysitter",
    code: "secret",
    access_token: "nope"
  })
);
const recordUrl = new URL(fromRecord, "https://www.anynanny.org");
assert.equal(recordUrl.searchParams.get("utm_source"), "instagram");
assert.equal(recordUrl.searchParams.get("utm_medium"), "reel");
assert.equal(recordUrl.searchParams.get("utm_campaign"), "babysitter");
assert.equal(recordUrl.searchParams.has("code"), false);
assert.equal(recordUrl.searchParams.has("access_token"), false);

const parentFromRecord = new URL(
  generalParentDemoHref(utmSearchFromRecord({ utm_term: "בייביסיטר", type: "recovery" })),
  "https://www.anynanny.org"
);
assert.equal(parentFromRecord.searchParams.get("role"), "parent");
assert.equal(parentFromRecord.searchParams.get("utm_term"), "בייביסיטר");
assert.equal(parentFromRecord.searchParams.get("type"), null);

const sitterFromRecord = new URL(
  generalSitterDemoHref(utmSearchFromRecord({ utm_content: "card", refresh_token: "nope" })),
  "https://www.anynanny.org"
);
assert.equal(sitterFromRecord.searchParams.get("role"), "sitter");
assert.equal(sitterFromRecord.searchParams.get("utm_content"), "card");
assert.equal(sitterFromRecord.searchParams.get("refresh_token"), null);

console.log("general acquisition landing tests passed");
