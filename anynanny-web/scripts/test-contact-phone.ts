import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTACT_PHONE_INVALID_HE,
  formatContactPhoneDisplay,
  normalizeIsraeliMobileForStorage,
  validateContactPhoneInput
} from "../lib/profile/contact-phone";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(normalizeIsraeliMobileForStorage("0501234567"), "0501234567");
assert.equal(normalizeIsraeliMobileForStorage("050-123-4567"), "0501234567");
assert.equal(normalizeIsraeliMobileForStorage("+972501234567"), "0501234567");
assert.equal(normalizeIsraeliMobileForStorage("972501234567"), "0501234567");
assert.equal(normalizeIsraeliMobileForStorage("501234567"), "0501234567");
assert.equal(normalizeIsraeliMobileForStorage(""), null);
assert.equal(normalizeIsraeliMobileForStorage("123"), null);
assert.equal(formatContactPhoneDisplay("0501234567"), "050-123-4567");
assert.equal(formatContactPhoneDisplay("+972501234567"), "050-123-4567");
assert.equal(validateContactPhoneInput(""), CONTACT_PHONE_INVALID_HE);
assert.equal(validateContactPhoneInput("0501234567"), null);
assert.equal(validateContactPhoneInput("abc"), CONTACT_PHONE_INVALID_HE);
assert.equal(CONTACT_PHONE_INVALID_HE, "יש להזין מספר טלפון תקין");

const parent = read("components/parent/parent-personal-area.tsx");
assert.match(parent, /label="טלפון"/);
assert.match(parent, /הוספת מספר/);
assert.match(parent, /מספר טלפון/);
assert.match(parent, /requestSaveOwnContactPhone/);
assert.match(parent, /validateContactPhoneInput/);
assert.match(parent, /formatContactPhoneDisplay/);
assert.doesNotMatch(parent, /parsed\.phone = user\.phone/);

const sitter = read("components/sitter/sitter-personal-area.tsx");
assert.match(sitter, /label="טלפון"/);
assert.match(sitter, /הוספת מספר/);
assert.match(sitter, /מספר טלפון/);
assert.match(sitter, /requestSaveOwnContactPhone/);
assert.match(sitter, /validateContactPhoneInput/);
assert.doesNotMatch(sitter.slice(sitter.indexOf("function formToPayload"), sitter.indexOf("type Props")), /\bphone:/);

const phoneRoute = read("app/api/profile/phone/route.ts");
assert.match(phoneRoute, /auth\.getUser\(\)/);
assert.match(phoneRoute, /saveOwnContactPhone/);
assert.match(phoneRoute, /user\.id/);

const phoneServer = read("lib/profile/own-contact-phone-server.ts");
assert.match(phoneServer, /server-only/);
assert.match(phoneServer, /PROFILES_TABLE/);
assert.match(phoneServer, /\.eq\("id", actorId\)/);
assert.match(phoneServer, /normalizeIsraeliMobileForStorage/);
assert.doesNotMatch(phoneServer, /getSupabaseServiceRoleClient|auth\.admin/);

const sitterApi = read("app/api/sitter/profile/route.ts");
assert.match(sitterApi, /authPhone/);
assert.doesNotMatch(sitterApi.slice(sitterApi.indexOf("export async function PUT"), sitterApi.indexOf("export async function PATCH")), /phone:/);

const publicSurfaces = [
  "lib/sitter/fetch-parent-sitter-profile.ts",
  "lib/sitter/parent-sitter-search.ts",
  "lib/sitter/public-search-card.ts",
  "components/sitter/public-sitter-search-card.tsx",
  "app/parent/search/page.tsx",
  "app/parent/search/results/page.tsx",
  "app/parent/sitter/[sitterId]/page.tsx"
];
for (const file of publicSurfaces) {
  const src = read(file);
  assert.doesNotMatch(src, /\/api\/profile\/phone/);
  assert.doesNotMatch(src, /profiles\.phone|select\("phone"\)/);
}

const lifecycleSrc = read("lib/chat/chat-lifecycle.ts");
assert.match(lifecycleSrc, /CHAT_GRACE_PERIOD_MS = 24 \* 60 \* 60 \* 1000/);
assert.doesNotMatch(lifecycleSrc, /\/api\/profile\/phone|contact-phone/);

console.log("contact phone personal-area contract ok");
