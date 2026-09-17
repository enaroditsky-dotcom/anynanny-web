import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AD_FORBIDDEN_PATH_PREFIXES,
  AD_FORBIDDEN_SURFACE_IDS,
  AD_NETWORK_INTEGRATION,
  AD_PLACEMENT_IDS,
  AD_SLOT_REGISTRY,
  ADVERTISING_MASTER_ENABLED,
  ADVERTISING_RULES,
  isAdSlotEnabled,
  isAdvertisingMasterEnabled,
  isPathAllowedForAdvertising,
  listEnabledAdPlacements,
  resolveAdSlotView,
  SPONSORED_ACCESSIBILITY_LABEL,
  SPONSORED_LABEL
} from "../lib/marketing/ad-slots";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, acc);
      continue;
    }
    if (/\.(tsx|ts|jsx|js|mjs|css|html|json)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const AD_NETWORK_PATTERN =
  /adsense|adsbygoogle|googlesyndication|doubleclick|googletagmanager|googletagservices|pagead2|googleadservices|securepubads|fbevents|connect\.facebook\.net|meta pixel|advertising\.js|adnxs|taboola|outbrain|criteo/i;

const FORBIDDEN_APP_AREAS = [
  "app/login",
  "app/register",
  "app/auth",
  "app/parent/onboarding",
  "app/sitter/onboarding",
  "app/welcome",
  "app/charter",
  "app/parent/checkout",
  "app/billing",
  "app/identity",
  "app/verify",
  "app/session",
  "app/parent/search",
  "app/parent/sitter",
  "app/parent/calendar",
  "app/parent/broadcast",
  "app/sitter/shifts",
  "app/sitter/session",
  "app/admin/reports",
  "components/auth",
  "components/onboarding",
  "components/billing",
  "components/identity",
  "components/safety",
  "components/bookings",
  "lib/billing",
  "lib/identity",
  "lib/safety",
  "lib/bookings"
];

const REQUIRED_PLACEMENTS = [
  "knowledge_article_inline",
  "knowledge_article_bottom",
  "community_sponsor",
  "marketplace_sponsored",
  "marketing_story_interstitial",
  "faq_sponsor"
] as const;

assert.equal(ADVERTISING_MASTER_ENABLED, false);
assert.equal(isAdvertisingMasterEnabled(), false);
assert.equal(AD_NETWORK_INTEGRATION, "none");
assert.deepEqual([...AD_PLACEMENT_IDS], [...REQUIRED_PLACEMENTS]);
assert.deepEqual(listEnabledAdPlacements(), []);

for (const id of AD_PLACEMENT_IDS) {
  assert.equal(AD_SLOT_REGISTRY[id].id, id);
  assert.equal(AD_SLOT_REGISTRY[id].enabled, false);
  assert.equal(isAdSlotEnabled(id), false);
  assert.deepEqual(resolveAdSlotView(id), { visible: false, placement: id });
}

assert.equal(SPONSORED_LABEL, "ממומן");
assert.equal(SPONSORED_ACCESSIBILITY_LABEL, "תוכן ממומן");
assert.ok(ADVERTISING_RULES.includes("Sponsored content must always be clearly labeled."));
assert.ok(ADVERTISING_RULES.includes("No intrusive popups."));
assert.ok(ADVERTISING_RULES.includes("No autoplay advertising."));
assert.ok(ADVERTISING_RULES.includes("No full-screen interstitials."));
assert.ok(
  ADVERTISING_RULES.includes(
    "Future personalized advertising or tracking must require a separate privacy/consent review before activation."
  )
);

assert.equal(isPathAllowedForAdvertising("/"), false);
assert.equal(isPathAllowedForAdvertising("/login"), false);
assert.equal(isPathAllowedForAdvertising("/register"), false);
assert.equal(isPathAllowedForAdvertising("/auth/sign-up"), false);
assert.equal(isPathAllowedForAdvertising("/parent/onboarding"), false);
assert.equal(isPathAllowedForAdvertising("/sitter/onboarding"), false);
assert.equal(isPathAllowedForAdvertising("/parent/search"), false);
assert.equal(isPathAllowedForAdvertising("/parent/checkout/complete"), false);
assert.equal(isPathAllowedForAdvertising("/identity/verification/return"), false);
assert.equal(isPathAllowedForAdvertising("/billing/test"), false);
assert.equal(isPathAllowedForAdvertising("/admin/reports"), false);
assert.equal(isPathAllowedForAdvertising("/parent/faq"), true);
assert.equal(isPathAllowedForAdvertising("/sitter/faq"), true);
assert.equal(isPathAllowedForAdvertising("/parent/settings"), true);
assert.ok(AD_FORBIDDEN_PATH_PREFIXES.includes("/login"));
assert.ok(AD_FORBIDDEN_SURFACE_IDS.includes("payments"));

const adSlot = read("components/marketing/ad-slot.tsx");
assert.match(adSlot, /resolveAdSlotView/);
assert.match(adSlot, /if \(!view\.visible\) \{\s*return null;/s);
assert.match(adSlot, /aria-label=\{view\.accessibilityLabel\}/);
assert.match(adSlot, /minHeight: view\.minHeightPx/);
assert.doesNotMatch(adSlot, /<script/);
assert.doesNotMatch(adSlot, /<iframe/);
assert.doesNotMatch(adSlot, /document\.cookie/);
assert.doesNotMatch(adSlot, /fetch\(/);
assert.doesNotMatch(adSlot, AD_NETWORK_PATTERN);

const surfaces = read("components/marketing/ad-surface-slots.tsx");
assert.match(surfaces, /placement="knowledge_article_inline"/);
assert.match(surfaces, /placement="knowledge_article_bottom"/);
assert.match(surfaces, /placement="community_sponsor"/);
assert.match(surfaces, /placement="marketplace_sponsored"/);
assert.match(surfaces, /placement="marketing_story_interstitial"/);
assert.match(surfaces, /placement="faq_sponsor"/);

const faqView = read("components/faq/faq-page-view.tsx");
assert.match(faqView, /FaqSponsorAdSlot/);
assert.doesNotMatch(faqView, /adsbygoogle|Advertisement|פרסומת/);

const community = read("components/settings/community-resources-section.tsx");
assert.match(community, /CommunitySponsorAdSlot/);
assert.doesNotMatch(community, /adsbygoogle|Advertisement|פרסומת/);

const knowledgeShell = read("components/marketing/knowledge-article-shell.tsx");
assert.match(knowledgeShell, /KnowledgeArticleBottomAdSlot/);
assert.match(knowledgeShell, /KnowledgeArticleInlineAdSlot/);

const marketplaceMount = read("components/marketing/marketplace-ad-mount.tsx");
assert.match(marketplaceMount, /MarketplaceSponsoredAdSlot/);
assert.match(marketplaceMount, /Keep this out of booking/);

const storyBreak = read("components/marketing/marketing-story-section-break.tsx");
assert.match(storyBreak, /MarketingStoryInterstitialAdSlot/);
assert.match(storyBreak, /full-screen overlay/);

const landing = read("app/page.tsx");
assert.doesNotMatch(landing, /AdSlot|ad-surface-slots|ad-slots/);

const packageJson = read("package.json");
assert.doesNotMatch(packageJson, AD_NETWORK_PATTERN);
assert.match(packageJson, /test:ad-ready-infrastructure/);

const docs = read("docs/advertising-infrastructure.md");
assert.match(docs, /Advertising Infrastructure — Ad Ready/);
assert.match(docs, /disabled by default/i);
assert.match(docs, /Activation is deferred until meaningful traffic exists/);
assert.match(docs, /Direct sponsorships/);
assert.match(docs, /Family-oriented advertisers/);
assert.match(docs, /Sponsored Marketplace placements/);
assert.match(docs, /Ad networks/);
assert.match(docs, /knowledge_article_inline/);
assert.match(docs, /faq_sponsor/);
assert.match(docs, /No full-screen interstitials/);
assert.match(docs, /privacy\/consent review/);

const readme = read("README.md");
assert.match(readme, /Advertising Infrastructure — Ad Ready/);
assert.match(readme, /disabled by default/);

const privacy = read("components/legal/privacy-policy-document.tsx");
assert.match(privacy, /אינה מציגה בפלטפורמה פרסומות של צדדים שלישיים/);

const forbiddenHits: string[] = [];
for (const area of FORBIDDEN_APP_AREAS) {
  const files = walkFiles(resolve(root, area));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (
      /from ["']@\/components\/marketing\/ad-slot["']/.test(source) ||
      /from ["']@\/components\/marketing\/ad-surface-slots["']/.test(source) ||
      /from ["']@\/lib\/marketing\/ad-slots["']/.test(source) ||
      /FaqSponsorAdSlot|CommunitySponsorAdSlot|MarketplaceSponsoredAdSlot|MarketingStoryInterstitialAdSlot|KnowledgeArticleInlineAdSlot/.test(
        source
      )
    ) {
      forbiddenHits.push(relative(root, file).replaceAll("\\", "/"));
    }
  }
}
assert.deepEqual(forbiddenHits, []);

const scannedRoots = ["app", "components", "lib", "features", "public"];
const networkHits: string[] = [];
for (const area of scannedRoots) {
  for (const file of walkFiles(resolve(root, area))) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (rel.startsWith("lib/marketing/") || rel.startsWith("components/marketing/")) {
      const source = readFileSync(file, "utf8");
      if (AD_NETWORK_PATTERN.test(source)) {
        networkHits.push(rel);
      }
      continue;
    }
    const source = readFileSync(file, "utf8");
    if (AD_NETWORK_PATTERN.test(source)) {
      networkHits.push(rel);
    }
  }
}
assert.deepEqual(networkHits, []);

console.log("Ad-ready infrastructure checks passed.");
