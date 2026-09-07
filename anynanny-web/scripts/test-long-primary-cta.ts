import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LONG_PRIMARY_CTA_CLASS,
  LONG_PRIMARY_CTA_CLUSTER_CLASS,
  LONG_PRIMARY_CTA_ICON_CLASS,
  PARENT_SITTER_SEARCH_CTA_LABEL
} from "../lib/ui/long-primary-cta";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(PARENT_SITTER_SEARCH_CTA_LABEL, "חיפוש בייביסיטר");
assert.match(LONG_PRIMARY_CTA_CLASS, /rounded-full/);
assert.doesNotMatch(LONG_PRIMARY_CTA_CLASS, /rounded-xl|rounded-2xl/);
assert.match(LONG_PRIMARY_CTA_CLASS, /bg-\[#001F3F\]/);
assert.match(LONG_PRIMARY_CTA_CLASS, /\bw-full\b/);
assert.match(LONG_PRIMARY_CTA_CLASS, /focus-visible:ring-2/);
assert.match(LONG_PRIMARY_CTA_CLUSTER_CLASS, /gap-\[0\.5em\]/);
assert.match(LONG_PRIMARY_CTA_CLUSTER_CLASS, /inline-flex flex-row/);
assert.match(LONG_PRIMARY_CTA_ICON_CLASS, /h-6 w-6/);
assert.doesNotMatch(LONG_PRIMARY_CTA_ICON_CLASS, /h-4 w-4/);

const dashboard = read("components/parent/parent-dashboard-client.tsx");
assert.match(dashboard, /LONG_PRIMARY_CTA_CLASS/);
assert.match(dashboard, /PARENT_SITTER_SEARCH_CTA_LABEL/);
assert.match(dashboard, /LongPrimaryCtaContent/);
assert.match(dashboard, /LONG_PRIMARY_CTA_ICON_CLASS/);
assert.doesNotMatch(dashboard, /חיפוש נני/);
assert.doesNotMatch(dashboard, /LongPrimaryCtaIcon/);

const searchPage = read("app/parent/search/page.tsx");
assert.match(searchPage, /LONG_PRIMARY_CTA_CLASS/);
assert.match(searchPage, /PARENT_SITTER_SEARCH_CTA_LABEL/);
assert.match(searchPage, /LongPrimaryCtaContent/);
assert.match(searchPage, /LONG_PRIMARY_CTA_ICON_CLASS/);
assert.doesNotMatch(searchPage, /חפש בייביסיטר/);
assert.doesNotMatch(searchPage, /LongPrimaryCtaIcon/);

const iconComponent = read("components/ui/long-primary-cta.tsx");
assert.match(iconComponent, /data-cta-icon-side="left"/);
assert.match(iconComponent, /aria-hidden/);
assert.match(iconComponent, /dir="ltr"/);
assert.match(iconComponent, /dir="rtl"/);
assert.doesNotMatch(iconComponent, /flex-row-reverse/);
assert.doesNotMatch(iconComponent, /absolute/);

console.log("Long primary CTA checks passed.");
