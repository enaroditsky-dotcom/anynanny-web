import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const page = read("app/dev/parent-profile-header/page.tsx");
const preview = read("app/dev/parent-profile-header/preview.tsx");
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const gate = read("components/app-shell-gate.tsx");
const middleware = read("middleware.ts");

const pageHeader = page.split("export default")[0] ?? "";
assert.match(page, /process\.env\.NODE_ENV === "development"/);
assert.match(page, /notFound\(\)/);
assert.doesNotMatch(pageHeader, /parent-profile-header\/preview|require\("\.\/preview"\)/);
assert.match(page, /require\("\.\/preview"\)/);
const developmentGuard = page.indexOf('process.env.NODE_ENV === "development"');
const previewRequire = page.indexOf('require("./preview")');
const notFoundCall = page.indexOf("notFound()");
assert.ok(developmentGuard !== -1 && previewRequire > developmentGuard && notFoundCall > previewRequire);

assert.match(gate, /"\/dev\/parent-profile-header"/);
assert.doesNotMatch(middleware, /parent-profile-header/);
assert.doesNotMatch(dashboard, /parent-profile-header|data-preview-profile-card|PREVIEW_SEARCH_CLASS/);
assert.doesNotMatch(read("components/app-shell-header.tsx"), /parent-profile-header/);
assert.doesNotMatch(read("components/bottom-nav.tsx"), /parent-profile-header/);

assert.match(preview, /data-dev-parent-profile-header/);
assert.match(preview, /data-preview-profile-photo/);
assert.match(preview, /data-preview-badges/);
assert.match(preview, /data-preview-search/);
assert.match(preview, /dir="ltr"/);
assert.match(preview, /תצוגת פיתוח/);
assert.match(preview, /SAMPLE_PUBLIC_ID/);
assert.match(preview, /VerifiedUserBadge/);
assert.match(preview, /לאימות הזהות/);
assert.match(preview, /PARENT_SITTER_SEARCH_CTA_LABEL/);
assert.match(preview, /w-fit max-w-full/);
assert.match(preview, /h-\[52px\]/);
assert.match(preview, /text-\[18px\]/);
assert.match(preview, /h-\[25px\] w-\[25px\]/);
assert.match(preview, /object-contain/);
assert.match(preview, /\/marketing\/demo\/inbal\.png/);
assert.doesNotMatch(preview, /<Link|href=|supabase|signOut|logoutAndRedirect|parent-dashboard-client/);

const badges = preview.indexOf('data-preview-badges=""');
const photo = preview.indexOf('data-preview-profile-photo=""');
const row = preview.indexOf('dir="ltr"');
assert.ok(row !== -1 && badges > row && photo > badges);

console.log("dev parent profile header preview: ok");
