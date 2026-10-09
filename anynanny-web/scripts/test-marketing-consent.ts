import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  profileMatchesBroadcastAudience,
  recipientIdsForBroadcastAudience,
  type BroadcastAudienceProfile
} from "../lib/admin/broadcast-audience";
import {
  MARKETING_CONSENT_ACCEPT_LABEL,
  MARKETING_CONSENT_CHECKBOX_LABEL,
  MARKETING_CONSENT_DECLINE_LABEL,
  MARKETING_CONSENT_INTRO,
  MARKETING_CONSENT_PROMPT_TITLE,
  MARKETING_CONSENT_SETTINGS_LABEL,
  MARKETING_CONSENT_VERSION,
  createMarketingConsentDecline,
  createMarketingConsentOptIn,
  createMarketingConsentOptOut,
  createRegistrationMarketingConsent,
  shouldShowMarketingConsentPrompt
} from "../lib/legal/marketing-consent";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(MARKETING_CONSENT_VERSION, "1.0");
assert.equal(
  MARKETING_CONSENT_INTRO,
  "ככל שקהילת AnyNanny גדלה, נוכל להשיג ולהציע לחברי הקהילה יותר הטבות, מבצעים והצעות רלוונטיות להורים ולבייביסיטריות."
);
assert.equal(
  MARKETING_CONSENT_CHECKBOX_LABEL,
  "כן, אשמח לקבל מ־AnyNanny עדכונים, טיפים, הטבות והצעות מיוחדות, לרבות תוכן שיווקי ופרסומי, באמצעות SMS, דוא\"ל והתראות דיגיטליות. ניתן לבטל את ההסכמה בכל עת."
);
assert.equal(MARKETING_CONSENT_PROMPT_TITLE, "נשארים מעודכנים 💚");
assert.equal(MARKETING_CONSENT_ACCEPT_LABEL, "כן, אשמח");
assert.equal(MARKETING_CONSENT_DECLINE_LABEL, "לא עכשיו");
assert.equal(MARKETING_CONSENT_SETTINGS_LABEL, "קבלת עדכונים והטבות");

const at = "2026-10-09T12:00:00.000Z";
const declined = createRegistrationMarketingConsent(false, at);
assert.equal(declined.marketing_consent, false);
assert.equal(declined.marketing_consent_at, null);
assert.equal(declined.marketing_consent_version, null);
assert.equal(declined.marketing_consent_source, null);
assert.equal(declined.marketing_consent_prompted_at, at);

const accepted = createRegistrationMarketingConsent(true, at);
assert.equal(accepted.marketing_consent, true);
assert.equal(accepted.marketing_consent_at, at);
assert.equal(accepted.marketing_consent_version, "1.0");
assert.equal(accepted.marketing_consent_source, "registration");
assert.equal(accepted.marketing_consent_prompted_at, at);

const promptYes = createMarketingConsentOptIn("post_login_prompt", at);
assert.equal(promptYes.marketing_consent_source, "post_login_prompt");
assert.equal(promptYes.marketing_consent_version, "1.0");

const promptNo = createMarketingConsentDecline(at);
assert.equal(promptNo.marketing_consent, false);
assert.equal(promptNo.marketing_consent_at, null);
assert.equal(promptNo.marketing_consent_prompted_at, at);

const withdrawn = createMarketingConsentOptOut("2026-01-01T00:00:00.000Z", at);
assert.equal(withdrawn.marketing_consent, false);
assert.equal(withdrawn.marketing_consent_prompted_at, "2026-01-01T00:00:00.000Z");
assert.equal(createMarketingConsentOptOut(null, at).marketing_consent_prompted_at, at);

assert.equal(
  shouldShowMarketingConsentPrompt({ marketing_consent: false, marketing_consent_prompted_at: null }),
  true
);
assert.equal(
  shouldShowMarketingConsentPrompt({ marketing_consent: false, marketing_consent_prompted_at: at }),
  false
);
assert.equal(
  shouldShowMarketingConsentPrompt({ marketing_consent: true, marketing_consent_prompted_at: null }),
  false
);
assert.equal(shouldShowMarketingConsentPrompt(null), false);

const signUp = read("app/auth/sign-up/page.tsx");
const register = read("app/register/page.tsx");
const prompt = read("components/marketing/marketing-consent-prompt.tsx");
const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
const settings = read("components/settings/marketing-consent-section.tsx");
const pushDeliver = read("lib/push/deliver-notification.ts");
const terms = read("components/legal/terms-of-service-document.tsx");
const privacy = read("components/legal/privacy-policy-document.tsx");
const migration = read("supabase/migrations/20261009150000_profiles_marketing_consent.sql");

assert.match(signUp, /MarketingConsentCheckbox/);
assert.match(register, /MarketingConsentCheckbox/);
assert.match(signUp, /createRegistrationMarketingConsent\(marketingConsent\)/);
assert.match(register, /createRegistrationMarketingConsent\(marketingConsent\)/);
assert.match(signUp, /if \(!acceptedLegal\)/);
assert.match(register, /if \(!acceptedLegal\)/);
assert.doesNotMatch(signUp, /if \(!marketingConsent\)/);
assert.doesNotMatch(register, /if \(!marketingConsent\)/);
assert.match(signUp, /useState\(false\)/);

assert.match(prompt, /MARKETING_CONSENT_PROMPT_TITLE/);
assert.match(prompt, /createMarketingConsentOptIn\("post_login_prompt"\)/);
assert.match(prompt, /createMarketingConsentDecline\(\)/);
assert.match(prompt, /shouldShowMarketingConsentPrompt/);

assert.match(parentSettings, /MarketingConsentSection/);
assert.match(sitterSettings, /MarketingConsentSection/);
assert.match(settings, /MARKETING_CONSENT_SETTINGS_LABEL/);
assert.match(settings, /createMarketingConsentOptIn\("settings"\)/);
assert.match(settings, /createMarketingConsentOptOut/);
assert.doesNotMatch(settings, /push_enabled|sound_enabled/);
assert.doesNotMatch(pushDeliver, /marketing_consent/);

assert.match(terms, /שיתופי פעולה פרסומיים ומסחריים עשויים להיות חלק ממודל הפעילות העסקית/);
assert.match(terms, /אינה מהווה כשלעצמה הסכמה לקבלת דיוור שיווקי ישיר/);
assert.match(terms, /יישלח רק למשתמשים שנתנו לכך הסכמה נפרדת/);
assert.match(terms, /ניתן לבטל את ההסכמה בכל עת/);
assert.match(terms, /אינן תלויות בהסכמה שיווקית/);
assert.match(terms, /אינה מוכרת למפרסמים את פרטי הקשר/);
assert.match(privacy, /רשאית להציג בפלטפורמה פרסום, תוכן מסחרי, הטבות, מבצעים והצעות של שותפים/);
assert.match(privacy, /אינה מהווה כשלעצמה הסכמה לקבלת דיוור שיווקי ישיר/);
assert.match(privacy, /נשלח רק למשתמשים שנתנו לכך הסכמה נפרדת/);
assert.match(privacy, /ניתן לבטל את ההסכמה בכל עת/);
assert.match(privacy, /נפרדות מהודעות שיווקיות ואינן תלויות בהסכמה שיווקית/);
assert.match(privacy, /אינה מוכרת למפרסמים את פרטי הקשר/);

assert.match(migration, /add column if not exists marketing_consent boolean not null default false/);
assert.match(migration, /add column if not exists marketing_consent_at timestamptz/);
assert.match(migration, /add column if not exists marketing_consent_version text/);
assert.match(migration, /add column if not exists marketing_consent_source text/);
assert.match(migration, /add column if not exists marketing_consent_prompted_at timestamptz/);
assert.match(migration, /when 'rp_marketing_opt_in'/);
assert.match(migration, /when 'ran_marketing_opt_in'/);
assert.match(migration, /normalize_parent_public_id\(p\.parent_serial\) like 'RP-%'/);
assert.match(migration, /normalize_sitter_public_id\(p\.nanny_serial\) like 'RAN-%'/);
assert.match(migration, /p\.marketing_consent is true/);
assert.doesNotMatch(migration, /update\s+public\.profiles/i);
assert.doesNotMatch(migration, /create table/i);

function row(
  partial: Partial<BroadcastAudienceProfile> & { id: string }
): BroadcastAudienceProfile {
  return {
    role: "parent",
    parent_onboarding_completed_at: "2026-09-01T00:00:00.000Z",
    sitter_onboarding_completed_at: null,
    identity_verification_status: "unverified",
    marketing_consent: false,
    ...partial
  };
}

const users: BroadcastAudienceProfile[] = [
  row({ id: "rp-yes", parent_serial: "RP-1001", marketing_consent: true }),
  row({ id: "rp-no", parent_serial: "RP-1002", marketing_consent: false }),
  row({ id: "legacy-parent-yes", parent_serial: "P-1001", marketing_consent: true }),
  row({
    id: "ran-yes",
    role: "sitter",
    nanny_serial: "RAN-1001",
    marketing_consent: true,
    parent_onboarding_completed_at: null
  }),
  row({
    id: "ran-no",
    role: "sitter",
    nanny_serial: "ran_1002",
    marketing_consent: false,
    parent_onboarding_completed_at: null
  }),
  row({
    id: "legacy-sitter-yes",
    role: "sitter",
    nanny_serial: "AN-1001",
    marketing_consent: true,
    parent_onboarding_completed_at: null
  }),
  row({
    id: "both-yes",
    parent_serial: "RP-1008",
    nanny_serial: "RAN-1008",
    marketing_consent: true
  })
];

assert.deepEqual(recipientIdsForBroadcastAudience(users, "rp_marketing_opt_in").sort(), [
  "both-yes",
  "rp-yes"
]);
assert.deepEqual(recipientIdsForBroadcastAudience(users, "ran_marketing_opt_in").sort(), [
  "both-yes",
  "ran-yes"
]);
assert.equal(
  profileMatchesBroadcastAudience(users[2], "parents"),
  true
);
assert.equal(profileMatchesBroadcastAudience(users[1], "parents"), true);
assert.equal(profileMatchesBroadcastAudience(users[3], "sitters"), true);

console.log("marketing consent checks passed.");
