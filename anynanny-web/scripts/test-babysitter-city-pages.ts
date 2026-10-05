import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "../app/sitemap";
import { GENERAL_ACQUISITION_CANONICAL, GENERAL_WEB_APP_PATH, generalParentDemoHref, generalSitterDemoHref, generalWebAppHref, utmSearchFromRecord } from "../lib/marketing/general-acquisition";
import {
  BABYSITTER_CITIES,
  babysitterCityCanonical,
  babysitterCityMetadata,
  babysitterCityPath,
  babysitterCityStaticParams,
  buildBabysitterCityStructuredData,
  getBabysitterCity,
  getNearbyBabysitterCities
} from "../lib/marketing/babysitter-cities";
import { buildPublicSitemap } from "../lib/seo/public-sitemap";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const EXPECTED = [
  ["haifa", "חיפה", "בחיפה"],
  ["tel-aviv", "תל אביב", "בתל אביב"],
  ["jerusalem", "ירושלים", "בירושלים"],
  ["rishon-lezion", "ראשון לציון", "בראשון לציון"],
  ["petah-tikva", "פתח תקווה", "בפתח תקווה"],
  ["ramat-gan", "רמת גן", "ברמת גן"],
  ["givatayim", "גבעתיים", "בגבעתיים"],
  ["holon", "חולון", "בחולון"],
  ["bat-yam", "בת ים", "בבת ים"],
  ["netanya", "נתניה", "בנתניה"],
  ["rehovot", "רחובות", "ברחובות"],
  ["ness-ziona", "נס ציונה", "בנס ציונה"],
  ["givat-shmuel", "גבעת שמואל", "בגבעת שמואל"],
  ["beer-sheva", "באר שבע", "בבאר שבע"],
  ["herzliya", "הרצליה", "בהרצליה"]
] as const;

assert.equal(existsSync(resolve(root, "app/babysitter/[city]/page.tsx")), true);
assert.equal(existsSync(resolve(root, "lib/marketing/babysitter-cities.ts")), true);
assert.equal(BABYSITTER_CITIES.length, 15);
assert.equal(new Set(BABYSITTER_CITIES.map((city) => city.slug)).size, 15);

for (const [slug, nameHe, inCityHe] of EXPECTED) {
  const city = getBabysitterCity(slug);
  assert.ok(city, slug);
  assert.equal(city.slug, slug);
  assert.equal(city.nameHe, nameHe);
  assert.equal(city.inCityHe, inCityHe);
  assert.equal(city.h1, `מחפשים בייביסיטר ${inCityHe}? מחפשת עבודה כבייביסיטר ${inCityHe}?`);
  assert.equal(`${city.h1Find} ${city.h1Work}`, city.h1);
  assert.equal(
    city.title,
    `בייביסיטר ${inCityHe} | חיפוש בייביסיטר ועבודה בבייביסיטר | AnyNanny`
  );
  assert.match(city.description, new RegExp(inCityHe));
  assert.match(city.parentHeading, new RegExp(`חיפוש בייביסיטר ${inCityHe}`));
  assert.match(city.sitterHeading, new RegExp(`מחפשת עבודה כבייביסיטר ${inCityHe}\\?`));
  assert.equal(city.heroAlt, `AnyNanny - חיפוש בייביסיטר ועבודה בבייביסיטר ${inCityHe}`);
  assert.ok(city.localNote.trim().length > 20);
  assert.equal(babysitterCityCanonical(slug), `https://www.anynanny.org/babysitter/${slug}`);
  assert.notEqual(babysitterCityCanonical(slug), GENERAL_ACQUISITION_CANONICAL);
  assert.equal(babysitterCityPath(slug), `/babysitter/${slug}`);
  for (const nearby of city.nearbyCitySlugs) {
    assert.ok(getBabysitterCity(nearby), `${slug} -> ${nearby}`);
    assert.notEqual(nearby, slug);
  }
}

assert.equal(
  getBabysitterCity("haifa")?.h1,
  "מחפשים בייביסיטר בחיפה? מחפשת עבודה כבייביסיטר בחיפה?"
);
assert.equal(
  getBabysitterCity("tel-aviv")?.h1,
  "מחפשים בייביסיטר בתל אביב? מחפשת עבודה כבייביסיטר בתל אביב?"
);
assert.equal(
  getBabysitterCity("haifa")?.title,
  "בייביסיטר בחיפה | חיפוש בייביסיטר ועבודה בבייביסיטר | AnyNanny"
);
assert.equal(
  getBabysitterCity("haifa")?.description,
  "מחפשים בייביסיטר בחיפה? ב־AnyNanny אפשר למצוא בייביסיטריות באזור, לבדוק זמינות ותעריפים ולפנות ישירות. מחפשת עבודה כבייביסיטר בחיפה? הצטרפי וקבלי פניות ממשפחות באזור."
);

const descriptions = BABYSITTER_CITIES.map((city) => city.description);
assert.equal(new Set(descriptions).size, 15);
const descriptionShells = BABYSITTER_CITIES.map((city) =>
  city.description.replaceAll(city.inCityHe, "{CITY}").replaceAll(city.nameHe, "{NAME}")
);
assert.equal(new Set(descriptionShells).size, 15);
const localNotes = BABYSITTER_CITIES.map((city) => city.localNote);
assert.equal(new Set(localNotes).size, 15);

const canonicals = BABYSITTER_CITIES.map((city) => babysitterCityCanonical(city.slug));
assert.equal(new Set(canonicals).size, 15);

const haifa = getBabysitterCity("haifa");
assert.ok(haifa);
assert.equal(getNearbyBabysitterCities(haifa).length, 0);
const telAvivNearby = getNearbyBabysitterCities(getBabysitterCity("tel-aviv")!).map((city) => city.slug);
assert.deepEqual(telAvivNearby, ["ramat-gan", "givatayim", "holon", "bat-yam", "petah-tikva", "herzliya"]);

const params = babysitterCityStaticParams();
assert.equal(params.length, 15);
assert.deepEqual(
  params.map((entry) => entry.city),
  EXPECTED.map(([slug]) => slug)
);
assert.equal(params.map((entry) => entry.city).join(" ").includes("london"), false);
assert.equal(getBabysitterCity("london"), null);
assert.equal(getBabysitterCity("telaviv"), null);
assert.equal(getBabysitterCity("haifa "), null);

const haifaMeta = babysitterCityMetadata(haifa);
assert.equal(haifaMeta.title, haifa.title);
assert.equal(haifaMeta.description, haifa.description);
assert.equal(haifaMeta.alternates && "canonical" in haifaMeta.alternates ? haifaMeta.alternates.canonical : null, babysitterCityCanonical("haifa"));
assert.equal(haifaMeta.robots && typeof haifaMeta.robots === "object" ? haifaMeta.robots.index : null, true);
assert.equal(haifaMeta.robots && typeof haifaMeta.robots === "object" ? haifaMeta.robots.follow : null, true);

const structured = buildBabysitterCityStructuredData(haifa);
const graph = structured["@graph"] as Array<Record<string, unknown>>;
const types = graph.map((node) => node["@type"]);
assert.ok(types.includes("WebPage"));
assert.ok(types.includes("BreadcrumbList"));
assert.equal(types.includes("JobPosting"), false);
assert.equal(types.includes("LocalBusiness"), false);
assert.doesNotMatch(JSON.stringify(structured), /JobPosting|LocalBusiness|AggregateRating|Review/);
const crumbs = graph.find((node) => node["@type"] === "BreadcrumbList");
assert.ok(crumbs);
const crumbItems = crumbs.itemListElement as Array<Record<string, unknown>>;
assert.deepEqual(
  crumbItems.map((item) => item.name),
  ["AnyNanny", "בייביסיטר", "בייביסיטר בחיפה"]
);
assert.equal(crumbItems[1]?.item, "https://www.anynanny.org/babysitter");
assert.equal(crumbItems[2]?.item, "https://www.anynanny.org/babysitter/haifa");
const webPage = graph.find((node) => node["@type"] === "WebPage");
assert.equal(webPage?.url, "https://www.anynanny.org/babysitter/haifa");

const page = read("app/babysitter/[city]/page.tsx");
const landing = read("components/marketing/general-acquisition-landing.tsx");
const generalPage = read("app/babysitter/page.tsx");
const css = read("components/marketing/general-acquisition-landing.module.css");

assert.match(page, /generateStaticParams/);
assert.match(page, /generateMetadata/);
assert.match(page, /dynamicParams = false/);
assert.match(page, /notFound\(\)/);
assert.match(page, /generalParentDemoHref/);
assert.match(page, /generalSitterDemoHref/);
assert.match(page, /generalWebAppHref/);
assert.match(page, /utmSearchFromRecord/);
assert.equal((page.match(/<h1[\s>]/g) || []).length, 0);
assert.equal((landing.match(/<h1[\s>]/g) || []).length, 1);
assert.doesNotMatch(page, /JobPosting|LocalBusiness/);
assert.doesNotMatch(landing, /JobPosting|LocalBusiness/);
assert.doesNotMatch(page, /play\.google\.com|apps\.apple\.com|\.apk/);
assert.doesNotMatch(landing, /play\.google\.com|apps\.apple\.com|\.apk/);
assert.match(landing, /href=\{GENERAL_ACQUISITION_PATH\}/);
assert.match(landing, /בייביסיטר לפי עיר/);
assert.match(landing, /BABYSITTER_CITIES\.map/);
assert.match(landing, /babysitterCityPath/);
assert.match(landing, /מחפשים גם באזור\?/);
assert.match(landing, /GENERAL_ACQUISITION_STUDENT_JOBS_HREF/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /flex-wrap:\s*wrap/);
assert.match(css, /min-height:\s*2\.75rem/);
assert.match(css, /min-height:\s*3\.25rem/);
assert.doesNotMatch(generalPage, /canonical:\s*["']https:\/\/www\.anynanny\.org\/babysitter\/haifa/);

const publicSitemap = buildPublicSitemap();
for (const [slug] of EXPECTED) {
  const entry = publicSitemap.find((item) => item.url === `https://www.anynanny.org/babysitter/${slug}`);
  assert.ok(entry, slug);
  assert.equal(entry.changeFrequency, "weekly");
  assert.equal(entry.priority, 0.8);
}
assert.ok(publicSitemap.some((entry) => entry.url === "https://www.anynanny.org/babysitter"));
assert.ok(publicSitemap.some((entry) => entry.url === "https://www.anynanny.org/jobs/students"));
assert.equal(publicSitemap.some((entry) => entry.url.includes("/babysitter/london")), false);

const liveSitemap = sitemap();
for (const [slug] of EXPECTED) {
  const entry = liveSitemap.find((item) => item.url === `https://www.anynanny.org/babysitter/${slug}`);
  assert.ok(entry, `live ${slug}`);
  assert.equal(entry.changeFrequency, "weekly");
  assert.equal(entry.priority, 0.8);
}
assert.ok(liveSitemap.some((entry) => entry.url === "https://www.anynanny.org/babysitter"));
assert.ok(liveSitemap.some((entry) => entry.url === "https://www.anynanny.org/jobs/students"));

assert.equal(GENERAL_WEB_APP_PATH, "/");
const web = new URL(
  generalWebAppHref(
    utmSearchFromRecord({
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: "haifa",
      utm_content: "hero",
      utm_term: "בייביסיטר",
      code: "secret",
      type: "recovery",
      unrelated: "drop"
    })
  ),
  "https://www.anynanny.org"
);
assert.equal(web.pathname, "/");
assert.equal(web.searchParams.get("utm_source"), "facebook");
assert.equal(web.searchParams.get("utm_medium"), "cpc");
assert.equal(web.searchParams.get("utm_campaign"), "haifa");
assert.equal(web.searchParams.get("utm_content"), "hero");
assert.equal(web.searchParams.get("utm_term"), "בייביסיטר");
assert.equal(web.searchParams.get("code"), null);
assert.equal(web.searchParams.get("type"), null);
assert.equal(web.searchParams.has("unrelated"), false);

const parentDemo = new URL(
  generalParentDemoHref("utm_source=facebook&utm_medium=cpc&utm_campaign=city&utm_content=card&utm_term=nanny&code=secret&unrelated=drop"),
  "https://www.anynanny.org"
);
assert.equal(parentDemo.pathname, "/marketing/demo/index.html");
assert.equal(parentDemo.searchParams.get("role"), "parent");
assert.notEqual(parentDemo.searchParams.get("role"), "sitter");
assert.equal(parentDemo.searchParams.get("utm_source"), "facebook");
assert.equal(parentDemo.searchParams.get("utm_medium"), "cpc");
assert.equal(parentDemo.searchParams.get("utm_campaign"), "city");
assert.equal(parentDemo.searchParams.get("utm_content"), "card");
assert.equal(parentDemo.searchParams.get("utm_term"), "nanny");
assert.equal(parentDemo.searchParams.get("code"), null);
assert.equal(parentDemo.searchParams.has("unrelated"), false);

const sitterDemo = new URL(
  generalSitterDemoHref("utm_source=instagram&utm_medium=story&code=secret&type=recovery"),
  "https://www.anynanny.org"
);
assert.equal(sitterDemo.pathname, "/marketing/demo/index.html");
assert.equal(sitterDemo.searchParams.get("role"), "sitter");
assert.notEqual(sitterDemo.searchParams.get("role"), "parent");
assert.equal(sitterDemo.searchParams.get("utm_source"), "instagram");
assert.equal(sitterDemo.searchParams.get("code"), null);
assert.equal(sitterDemo.searchParams.get("type"), null);

console.log("babysitter city page tests passed");
