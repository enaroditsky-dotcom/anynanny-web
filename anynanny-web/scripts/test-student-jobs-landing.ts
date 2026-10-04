import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { welcomeSignupHref } from "../lib/charter/routing";
import { marketingDemoHref } from "../lib/marketing/demo-entry";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";
import {
  STUDENT_CAMPAIGN_HERO_SRC,
  STUDENT_JOBS_BENEFITS,
  STUDENT_JOBS_CANONICAL,
  STUDENT_JOBS_DESCRIPTION,
  STUDENT_JOBS_H1_LINES,
  STUDENT_JOBS_PATH,
  STUDENT_JOBS_PRIMARY_CTA,
  STUDENT_JOBS_PROOF,
  STUDENT_JOBS_SIGNUP_NOTE,
  STUDENT_JOBS_SLOGAN,
  STUDENT_JOBS_SUPPORT,
  STUDENT_JOBS_TITLE,
  studentSitterSignupHref,
  utmSearchFromRecord
} from "../lib/marketing/student-jobs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(existsSync(resolve(root, "app/jobs/students/page.tsx")), true);

const page = read("app/jobs/students/page.tsx");
const landing = read("components/marketing/student-jobs-landing.tsx");
const css = read("components/marketing/student-jobs-landing.module.css");

assert.equal(STUDENT_JOBS_PATH, "/jobs/students");
assert.equal(STUDENT_JOBS_TITLE, "עבודה בבייביסיטר לסטודנטיות | עבודה גמישה עם AnyNanny");
assert.equal(
  STUDENT_JOBS_DESCRIPTION,
  "מחפשת עבודה בבייביסיטר שמתאימה ללימודים? ב־AnyNanny את מסמנת מתי את זמינה, מגדירה את התעריף שלך ומקבלת פניות ממשפחות באזור שלך."
);
assert.equal(STUDENT_JOBS_CANONICAL, "https://www.anynanny.org/jobs/students");
assert.deepEqual(STUDENT_JOBS_H1_LINES, ["2 קליקים לבייביסיטר!"]);
assert.equal(STUDENT_JOBS_PRIMARY_CTA, "הצטרפי ל־AnyNanny");
assert.equal(
  STUDENT_JOBS_SUPPORT,
  "עבודה גמישה, בשעות שנוחות לך, עם משפחות אמיתיות באזור שלך."
);
assert.equal(STUDENT_JOBS_SIGNUP_NOTE, "הרשמה פשוטה תוך 3 דקות");
assert.equal(STUDENT_JOBS_SLOGAN, "עבודת בייביסיטר בקליק — קרוב אלייך ובזמן שלך");
assert.equal(STUDENT_JOBS_PROOF, "מאות הורים באזור שלך מחפשים בייביסיטר ממש עכשיו");
assert.deepEqual(
  STUDENT_JOBS_BENEFITS.map((benefit) => [benefit.title, benefit.body]),
  [
    [
      "פשוט מסמנת זמינות ביומן שלך",
      "את מסמנת מתי את יכולה לעבוד — ולפי זה את מופיעה בחיפושים של ההורים."
    ],
    ["מגדירה כמה עולה שעת הבייביסיטר שלך", "תמיד אפשר לעדכן את התעריף באזור האישי."],
    ["מקבלת פניות רלוונטיות", "ממשפחות באזור שלך."],
    ["ההחלטה לקבל או לא לקבל את פניית ההורה היא שלך", "את בוחרת אם הפנייה מתאימה לך."]
  ]
);
assert.equal(STUDENT_CAMPAIGN_HERO_SRC, null);

assert.match(page, /title: STUDENT_JOBS_TITLE/);
assert.match(page, /description: STUDENT_JOBS_DESCRIPTION/);
assert.match(page, /canonical: STUDENT_JOBS_CANONICAL/);
assert.match(page, /index:\s*true/);
assert.match(page, /follow:\s*true/);
assert.doesNotMatch(page, /noindex/);
assert.doesNotMatch(landing, /noindex/);
assert.doesNotMatch(page, /JobPosting/);
assert.doesNotMatch(landing, /JobPosting/);
assert.match(page, /"@type": "WebPage"/);
assert.doesNotMatch(page, /"@type": "Organization"/);
assert.match(page, /studentSitterSignupHref/);
assert.match(landing, /data-cta="sitter-signup"/);
assert.match(landing, /data-cta="sitter-demo"/);
assert.match(landing, /data-cta-placement="phone"/);
assert.match(landing, /STUDENT_JOBS_PHONE_CTA/);
assert.match(landing, /STUDENT_JOBS_SLOGAN/);
assert.match(landing, /className=\{styles\.slogan\}/);
assert.match(landing, /STUDENT_JOBS_SUPPORT/);
assert.match(landing, /STUDENT_JOBS_SIGNUP_NOTE/);
assert.match(landing, /STUDENT_JOBS_PROOF/);
assert.match(landing, /proofBadge/);
assert.doesNotMatch(css, /768\s*\/\s*620/);
assert.doesNotMatch(css, /rotate\(/);
assert.doesNotMatch(landing, /כניסה לאפליקציה/);
assert.doesNotMatch(landing, /data-cta-placement="secondary"/);
assert.doesNotMatch(landing, /STUDENT_JOBS_WEB_LABEL/);
assert.doesNotMatch(landing, /<footer/);
assert.match(landing, /two-worlds\.png|sitterScene/);
assert.match(css, /\/marketing\/demo\/two-worlds\.png/);
assert.equal(existsSync(resolve(root, "public/marketing/demo/two-worlds.png")), true);
assert.doesNotMatch(landing, /מה מתאים לך/);
assert.doesNotMatch(landing, /STUDENT_JOBS_EXPERIENCE/);
assert.doesNotMatch(landing, /play\.google\.com|apps\.apple\.com/);
assert.match(page, /marketingDemoHref\("sitter"/);
assert.doesNotMatch(page, /marketingDemoHref\("parent"/);
assert.match(landing, /data-cta-placement="hero"/);
assert.match(landing, /STUDENT_JOBS_PRIMARY_CTA/);
assert.match(landing, /<h1 /);
assert.equal((landing.match(/<h1 /g) || []).length, 1);
assert.match(landing, /dir="rtl"/);
assert.match(landing, /AnyNannyLogo/);
assert.match(landing, /data-asset-required="student-campaign-hero"/);
assert.doesNotMatch(landing, /loginHref\(/);
assert.doesNotMatch(landing, /role=parent/);
assert.doesNotMatch(landing, /play\.google\.com/);
assert.doesNotMatch(landing, /apps\.apple\.com/);
assert.doesNotMatch(css, /#165b73|#2b7e96|#006b58/i);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /min-height:\s*3\.25rem/);
assert.match(css, /flex-wrap:\s*wrap/);
assert.match(css, /@media \(max-width: 430px\)/);
assert.match(css, /#3a9a44/);
assert.match(css, /#001f3f/);
assert.match(css, /\.primaryCta \.brandName span\s*\{[^}]*color:\s*#fff/);

assert.ok(
  buildPublicSitemap().some((entry) => entry.url === "https://www.anynanny.org/jobs/students")
);

const plainDemo = new URL(marketingDemoHref("sitter"), "https://www.anynanny.org");
assert.equal(plainDemo.pathname, "/marketing/demo/index.html");
assert.equal(plainDemo.searchParams.get("role"), "sitter");
assert.equal(plainDemo.searchParams.has("role") && plainDemo.searchParams.get("role") !== "parent", true);
const demoWithUtm = new URL(
  marketingDemoHref(
    "sitter",
    "utm_source=facebook&utm_medium=group&utm_campaign=students&code=secret&type=recovery"
  ),
  "https://www.anynanny.org"
);
assert.equal(demoWithUtm.pathname, "/marketing/demo/index.html");
assert.equal(demoWithUtm.searchParams.get("role"), "sitter");
assert.equal(demoWithUtm.searchParams.get("utm_source"), "facebook");
assert.equal(demoWithUtm.searchParams.get("utm_medium"), "group");
assert.equal(demoWithUtm.searchParams.get("utm_campaign"), "students");
assert.equal(demoWithUtm.searchParams.get("code"), null);
assert.equal(demoWithUtm.searchParams.get("type"), null);
assert.doesNotMatch(demoWithUtm.toString(), /role=parent/);

const plain = studentSitterSignupHref();
assert.equal(plain, welcomeSignupHref("sitter"));
const plainUrl = new URL(plain, "https://www.anynanny.org");
assert.equal(plainUrl.pathname, "/welcome");
assert.equal(plainUrl.searchParams.get("role"), "sitter");
const plainNext = plainUrl.searchParams.get("next");
assert.ok(plainNext);
const plainNextUrl = new URL(plainNext, "https://www.anynanny.org");
assert.equal(plainNextUrl.pathname, "/register");
assert.equal(plainNextUrl.searchParams.get("role"), "sitter");
assert.equal(plainNextUrl.searchParams.get("track"), "babysitter");
assert.equal(plainUrl.searchParams.get("role") === "parent", false);
assert.doesNotMatch(plain, /role=parent/);

for (const sample of [
  "utm_source=facebook&utm_medium=group&utm_campaign=students",
  "?utm_source=instagram&utm_medium=reel&utm_campaign=students",
  "utm_source=campus&utm_medium=whatsapp&utm_campaign=students&utm_content=story&utm_term=babysitter"
]) {
  const href = studentSitterSignupHref(sample);
  const url = new URL(href, "https://www.anynanny.org");
  assert.equal(url.pathname, "/welcome");
  assert.equal(url.searchParams.get("role"), "sitter");
  assert.equal(url.searchParams.get("utm_campaign"), "students");
  const next = url.searchParams.get("next");
  assert.ok(next);
  const nextUrl = new URL(next, "https://www.anynanny.org");
  assert.equal(nextUrl.pathname, "/register");
  assert.equal(nextUrl.searchParams.get("role"), "sitter");
  assert.equal(nextUrl.searchParams.get("track"), "babysitter");
  assert.equal(nextUrl.searchParams.get("utm_source"), url.searchParams.get("utm_source"));
  assert.equal(nextUrl.searchParams.get("utm_medium"), url.searchParams.get("utm_medium"));
  assert.doesNotMatch(href, /role=parent/);
}

const filtered = studentSitterSignupHref("utm_source=facebook&code=secret&type=recovery");
const filteredUrl = new URL(filtered, "https://www.anynanny.org");
assert.equal(filteredUrl.searchParams.get("utm_source"), "facebook");
assert.equal(filteredUrl.searchParams.get("code"), null);
assert.equal(filteredUrl.searchParams.get("type"), null);

const fromRecord = studentSitterSignupHref(
  utmSearchFromRecord({
    utm_source: "instagram",
    utm_medium: ["reel"],
    unrelated: "drop-me"
  })
);
const recordUrl = new URL(fromRecord, "https://www.anynanny.org");
assert.equal(recordUrl.searchParams.get("utm_source"), "instagram");
assert.equal(recordUrl.searchParams.get("utm_medium"), "reel");
assert.equal(recordUrl.searchParams.has("unrelated"), false);

console.log("student jobs landing tests passed");
