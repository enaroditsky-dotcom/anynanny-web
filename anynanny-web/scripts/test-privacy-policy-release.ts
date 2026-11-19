import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLegalAcceptanceRecord } from "../lib/legal/acceptance";
import { shouldShowPrivacyPolicyV12Notice } from "../lib/legal/privacy-policy-notice";
import {
  acceptedPrivacyDocVersion,
  isPrivacyPolicyV12InForce,
  privacyPolicyMetadataDescription,
  PRIVACY_POLICY_RELEASE
} from "../lib/legal/privacy-release";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(PRIVACY_POLICY_RELEASE.published, false);
assert.equal(PRIVACY_POLICY_RELEASE.publicationDateLabel, null);
assert.equal(isPrivacyPolicyV12InForce(), false);
assert.equal(acceptedPrivacyDocVersion(), "1.1");
assert.match(privacyPolicyMetadataDescription(), /טרם פורסם/);
assert.doesNotMatch(privacyPolicyMetadataDescription(), /מועד פרסום/);

const record = createLegalAcceptanceRecord("2026-11-19T00:00:00.000Z");
assert.equal(record.privacy_version, "1.1");
assert.equal(record.terms_version, "1.1");

const existing = {
  inForce: true,
  authenticated: true,
  privacyAcceptedAt: "2026-08-01T00:00:00.000Z",
  privacyVersion: "1.1",
  dismissed: false
};
assert.equal(shouldShowPrivacyPolicyV12Notice(existing), true);
assert.equal(shouldShowPrivacyPolicyV12Notice({ ...existing, inForce: false }), false);
assert.equal(shouldShowPrivacyPolicyV12Notice({ ...existing, privacyVersion: "1.2" }), false);
assert.equal(shouldShowPrivacyPolicyV12Notice({ ...existing, dismissed: true }), false);
assert.equal(shouldShowPrivacyPolicyV12Notice({ ...existing, privacyAcceptedAt: null }), false);
assert.equal(shouldShowPrivacyPolicyV12Notice({ ...existing, authenticated: false }), false);
assert.equal(
  shouldShowPrivacyPolicyV12Notice({ ...existing, privacyVersion: null }),
  true
);

const notice = read("components/legal/privacy-policy-update-notice.tsx");
const acceptance = read("lib/legal/acceptance.ts");
const shell = read("components/app-shell-gate.tsx");
assert.match(notice, /isPrivacyPolicyV12InForce/);
assert.match(notice, /role="status"/);
assert.match(notice, /סגירת ההודעה אינה הסכמה חדשה/);
assert.match(notice, /localStorage/);
assert.doesNotMatch(notice, /persistLegalAcceptanceIfUnset|signOut|\.update\(/);
assert.match(acceptance, /if \(!row\.privacy_accepted_at\?\.trim\(\)\)/);
assert.doesNotMatch(acceptance, /privacy_version: PRIVACY_DOC_VERSION/);
assert.match(shell, /PrivacyPolicyUpdateNotice/);

console.log("Privacy Policy release checks passed.");
