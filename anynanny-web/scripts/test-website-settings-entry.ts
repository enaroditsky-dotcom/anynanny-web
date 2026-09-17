import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const entry = read("components/settings/website-settings-entry.tsx");
const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
const bottomNav = read("components/bottom-nav.tsx");

assert.match(entry, /WEBSITE_SETTINGS_TITLE = "בקרו באתר AnyNanny"/);
assert.match(entry, /WEBSITE_SETTINGS_SUBTITLE = "הכירו את הסיפור שלנו, הקהילה וכל מה שחדש"/);
assert.match(entry, /ANYNANNY_WEBSITE_HREF = "https:\/\/www\.anynanny\.org"/);
assert.match(entry, /from "lucide-react"/);
assert.match(entry, /\bGlobe\b/);
assert.match(entry, /h-8 w-8/);
assert.match(entry, /h-4 w-4/);
assert.match(entry, /rounded-3xl/);
assert.match(entry, /shadow-soft/);
assert.match(entry, /min-h-\[44px\]/);
assert.match(entry, /text-base font-extrabold/);
assert.match(entry, /text-xs font-normal/);
assert.match(entry, /target="_blank"/);
assert.match(entry, /rel="noopener noreferrer"/);
assert.match(entry, /href=\{ANYNANNY_WEBSITE_HREF\}/);
assert.match(entry, /נפתח בדפדפן חיצוני/);

function assertWebsiteCardIsFirst(source: string, label: string) {
  assert.match(source, /WebsiteSettingsEntry/, `${label}: website card present`);
  const body = source.slice(source.indexOf("return"));
  const websiteIdx = body.indexOf("<WebsiteSettingsEntry");
  const notificationsIdx = body.indexOf("<NotificationSettingsSection");
  assert.ok(websiteIdx >= 0, `${label}: website card rendered`);
  assert.ok(notificationsIdx >= 0, `${label}: notifications still rendered`);
  assert.ok(websiteIdx < notificationsIdx, `${label}: website card above notifications`);
}

assertWebsiteCardIsFirst(parentSettings, "parent settings");
assertWebsiteCardIsFirst(sitterSettings, "sitter settings");

assert.match(parentSettings, /ParentTourSettingsEntry/);
assert.match(parentSettings, /SettingsFaqEntry href="\/parent\/faq"/);
assert.match(sitterSettings, /SitterTourSettingsEntry/);
assert.match(sitterSettings, /SettingsFaqEntry href="\/sitter\/faq"/);

assert.doesNotMatch(bottomNav, /WebsiteSettingsEntry/);
assert.doesNotMatch(bottomNav, /בקרו באתר AnyNanny/);
assert.doesNotMatch(bottomNav, /anynanny\.org/);

console.log("Website settings entry checks passed.");
