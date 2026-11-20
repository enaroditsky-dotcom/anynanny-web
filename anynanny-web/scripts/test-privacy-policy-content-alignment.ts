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
import {
  acceptedPrivacyDocVersion,
  isPrivacyPolicyV12InForce,
  PRIVACY_POLICY_PREPARATION_DATE_LABEL
} from "../lib/legal/privacy-release";

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
const landing = read("components/home/application-home-page.tsx");
const privacyLink = read("components/marketing/marketing-privacy-link.tsx");
const parentsLanding = read("components/marketing/parents-landing.tsx");
const appLanding = read("components/marketing/app-landing.tsx");
const babysitterLanding = read("components/marketing/general-acquisition-landing.tsx");
const studentJobsLanding = read("components/marketing/student-jobs-landing.tsx");

assert.match(page, /export default function PrivacyPage/);
assert.match(page, /PrivacyPageView/);
assert.match(page, /privacyPolicyMetadataDescription/);
assert.match(page, /absoluteSiteUrl\("\/privacy"\)/);
assert.match(checkbox, /href="\/privacy"/);
assert.match(parentSettings, /href="\/privacy"/);
assert.match(sitterSettings, /href="\/privacy"/);
assert.doesNotMatch(login, /href=["']\/privacy["']/);
assert.match(landing, /MarketingPrivacyLink/);
assert.match(privacyLink, /href="\/privacy"/);
assert.match(privacyLink, /מדיניות פרטיות/);
assert.match(parentsLanding, /MarketingPrivacyLink/);
assert.match(appLanding, /MarketingPrivacyLink/);
assert.match(babysitterLanding, /MarketingPrivacyLink/);
assert.match(studentJobsLanding, /MarketingPrivacyLink/);
assert.doesNotMatch(studentJobsLanding, /<footer/);

assert.match(policy, /שמות ילדים ותאריכי לידה/);
assert.match(policy, /פרטי בן או בת זוג/);
assert.match(policy, /תאריך נישואין/);
assert.match(policy, /אירועים מיוחדים/);
assert.match(policy, /מספר תעודת זהות ישראלית/);
assert.match(policy, /פרטי בנק/);
assert.match(policy, /Web Push/);
assert.match(policy, /user-agent/);
assert.match(policy, /תוכן הודעות/);
assert.match(policy, /אדוארד נרודיצקי \(Edward Naroditsky\)/);
assert.match(policy, /בקר המידע/);
assert.match(policy, /המותג AnyNanny/);
assert.match(policy, /ANYNANNY_SUPPORT_EMAIL/);
assert.match(read("lib/legal/contact.ts"), /support@anynanny\.org/);
assert.doesNotMatch(policy, /אינה מציינת את שמו האזרחי/);
assert.match(policy, /אלרגיה, רגישות, מצב רפואי, צורך מיוחד/);
assert.match(policy, /כאשר התשובה היא כן, פירוט בטקסט חופשי הוא רשות/);
assert.match(policy, /הפירוט החופשי אינו חובה/);
assert.doesNotMatch(policy, /הפירוט החופשי נדרש/);
assert.match(policy, /תשובת כן או לא על מידע רפואי או צורך מיוחד/);
assert.match(policy, /בלי שדה חובה אי אפשר לסיים את אותו שלב/);
assert.match(policy, /אינו מוצג בפרופיל הציבורי, בתוצאות החיפוש או בתצוגת המקדימה/);
assert.match(policy, /תוכן ההודעה גלוי למשתתפי אותו צ'אט/);
assert.match(policy, /עוד לפני שהיא מקבלת את הבקשה/);
assert.match(policy, /לאחר אישור ההזמנה/);
assert.match(policy, /Didit/);
assert.match(policy, /נתוני ההחלטה המתקבלים ב־webhook מ־Didit/);
assert.match(policy, /מספר מסמך שחולץ/);
assert.match(policy, /אינה שומרת את קובצי התמונה עצמם/);
assert.match(policy, /קישור זמני לתמונת המסמך/);
assert.match(policy, /במזומן, ב־Bit או ב־PayBox/);
assert.match(policy, /Hyp Pay \(HYP\) אינו מחובר ואינו ספק פעיל/);
assert.doesNotMatch(policy, /מתבצעים באמצעות Hyp Pay/);
assert.doesNotMatch(policy, /מתבצע באמצעות Hyp Pay/);
assert.match(policy, /לא זוהתה הטמעה של כלי אנליטיקה של צד שלישי/);
assert.match(policy, /אינה מתארת את Google Analytics או את Firebase Analytics ככלים פעילים/);
assert.match(policy, /אינם תכונות פעילות של השירות/);

assert.match(policy, /Supabase/);
assert.match(policy, /Didit/);
assert.doesNotMatch(policy, /Stripe/);
assert.doesNotMatch(policy, /Cardcom/);
assert.match(policy, /רשאית להציג בפלטפורמה פרסום, תוכן מסחרי, הטבות, מבצעים והצעות של שותפים/);
assert.match(policy, /אינה מהווה כשלעצמה הסכמה לקבלת דיוור שיווקי ישיר/);
assert.match(policy, /אינה מוכרת למפרסמים את פרטי הקשר/);
assert.doesNotMatch(policy, /אינה מציגה בפלטפורמה פרסומות של צדדים שלישיים/);

assert.match(policy, /מחיקת החשבון בהגדרות החשבון/);
assert.match(policy, /מנסה למחוק את קובצי תמונת הפרופיל/);
assert.match(policy, /מוחקת את חשבון ההתחברות/);
assert.match(policy, /אין הבטחה שכל עותק אצל ספק חיצוני נמחק/);
assert.match(policy, /החשבון נשאר עד שהעיכוב יוסר/);
assert.match(policy, /אין חובה שבדין למסור מידע זה/);
assert.match(policy, /אינם נכללים בתשובה שנמסרת לה/);
assert.match(policy, /גלוי להורה בלבד/);
assert.match(policy, /כפופה למדיניות השמירה והמחיקה של אותם ספקים/);
assert.match(policy, /מועד פרסום: \{PRIVACY_POLICY_RELEASE\.publicationDateLabel\}/);
assert.match(policy, /פורסמה ב־20 בנובמבר 2026/);
assert.equal(PRIVACY_POLICY_PREPARATION_DATE_LABEL, "19 בנובמבר 2026");
assert.match(policy, /אינו תנאי לסיום ההרשמה/);
assert.match(policy, /לא אומתו הסכם עיבוד/);
assert.doesNotMatch(policy, /ההעברה תיעשה בהתאם לדין/);
assert.match(policy, /מסירת ההודעה או סגירתה אינן הסכמה חדשה/);
assert.match(policy, /אישור שכבר נרשם לגרסה קודמת נשמר/);
assert.match(policy, /גרסה \{PRIVACY_DOC_VERSION\}/);
assert.equal(isPrivacyPolicyV12InForce(), true);
assert.equal(acceptedPrivacyDocVersion(), "1.2");

assert.equal(LEGAL_DOC_VERSION, "1.1");
assert.equal(TERMS_DOC_VERSION, "1.1");
assert.equal(PRIVACY_DOC_VERSION, "1.2");
const record = createLegalAcceptanceRecord("2026-08-23T00:00:00.000Z");
assert.equal(record.terms_version, "1.1");
assert.equal(record.privacy_version, "1.2");

assert.match(deleteAccount, /removeAuthenticatedUserAvatars\(supabase\)/);
assert.match(deleteAccount, /supabase\.rpc\("delete_current_user"\)/);
assert.doesNotMatch(deleteAccount, /rpc\("delete_current_user",/);

console.log("Privacy Policy content-alignment checks passed.");
