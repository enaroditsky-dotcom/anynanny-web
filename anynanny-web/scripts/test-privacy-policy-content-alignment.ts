import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLegalAcceptanceRecord,
  LEGAL_DOC_VERSION,
  PRIVACY_DOC_VERSION,
  TERMS_DOC_VERSION
} from "../lib/legal/acceptance";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const policy = read("components/legal/privacy-policy-document.tsx");
const page = read("app/privacy/page.tsx");
const checkbox = read("components/auth/terms-acceptance-checkbox.tsx");
const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
const deleteAccount = read("lib/account/delete-current-user.ts");
const login = read("app/auth/login/page.tsx");
const landing = read("app/page.tsx");

assert.match(page, /export default function PrivacyPage/);
assert.match(page, /PrivacyPageView/);
assert.match(checkbox, /href="\/privacy"/);
assert.match(parentSettings, /href="\/privacy"/);
assert.match(sitterSettings, /href="\/privacy"/);
assert.doesNotMatch(login, /href=["']\/privacy["']/);
assert.doesNotMatch(landing, /href=["']\/privacy["']/);

assert.match(policy, /שמות ילדים ותאריכי לידה/);
assert.match(policy, /פרטי בן או בת זוג/);
assert.match(policy, /תאריך נישואין/);
assert.match(policy, /אירועים מיוחדים/);
assert.match(policy, /מספר תעודת זהות ישראלית/);
assert.match(policy, /פרטי בנק ומשיכה/);
assert.match(policy, /Web Push/);
assert.match(policy, /user-agent/);
assert.match(policy, /תוכן הודעות/);

assert.match(policy, /Supabase/);
assert.match(policy, /Hyp Pay \(HYP \/ SHVA\)/);
assert.doesNotMatch(policy, /Stripe/);
assert.doesNotMatch(policy, /Cardcom/);
assert.doesNotMatch(policy, /שירותי אנליטיקה;/);
assert.match(policy, /אינה מפעילה כלי אנליטיקה של צד שלישי/);
assert.match(policy, /אינה מציגה בפלטפורמה פרסומות של צדדים שלישיים/);

assert.match(policy, /מחיקת החשבון בהגדרות החשבון/);
assert.match(policy, /מנסה למחוק את קובצי תמונת הפרופיל/);
assert.match(policy, /מוחקת לצמיתות את חשבון ההתחברות ואת פרופיל המשתמש/);
assert.match(policy, /תיעוד עסקאות ותשלומים/);
assert.match(policy, /גרסה \{PRIVACY_DOC_VERSION\}/);

assert.equal(LEGAL_DOC_VERSION, "1.0");
assert.equal(TERMS_DOC_VERSION, "1.0");
assert.equal(PRIVACY_DOC_VERSION, "1.1");
const record = createLegalAcceptanceRecord("2026-08-23T00:00:00.000Z");
assert.equal(record.terms_version, "1.0");
assert.equal(record.privacy_version, "1.1");

assert.match(deleteAccount, /removeAuthenticatedUserAvatars\(supabase\)/);
assert.match(deleteAccount, /supabase\.rpc\("delete_current_user"\)/);
assert.doesNotMatch(deleteAccount, /rpc\("delete_current_user",/);

console.log("Privacy Policy content-alignment checks passed.");
