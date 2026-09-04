import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeDiditWebhookBody,
  DIDIT_WORKFLOW_ID,
  mapDiditStatusToProfile,
  shouldKeepDiditPending
} from "../lib/identity/didit";
import { hmacSha256Hex, verifyDiditWebhook } from "../lib/identity/didit-signature";
import { isDiditSessionPrimaryKeyConflict } from "../lib/identity/didit-db";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(DIDIT_WORKFLOW_ID, "3f1ec9f2-1722-4264-bb57-7fac9649256c");

const verifyRoute = read("app/api/verify/route.ts");
assert.match(verifyRoute, /process\.env\.DIDIT_WORKFLOW_ID/);
assert.match(verifyRoute, /workflow_id: workflowId/);
assert.match(verifyRoute, /x-api-key/);
assert.match(verifyRoute, /readDiditApiKey/);
assert.match(verifyRoute, /auth\.getUser\(\)/);
assert.match(verifyRoute, /vendor_data: user\.id/);
assert.match(verifyRoute, /url: session\.url, session_id: session\.session_id/);
assert.doesNotMatch(verifyRoute, /DIDIT_API_KEY!/);

const diditDb = read("lib/identity/didit-db.ts");
const insertFn = diditDb.slice(
  diditDb.indexOf("export function isDiditSessionPrimaryKeyConflict"),
  diditDb.indexOf("export async function markDiditProfilePending")
);
assert.match(insertFn, /\.insert\(/);
assert.match(insertFn, /isDiditSessionPrimaryKeyConflict/);
assert.match(insertFn, /23505/);
assert.match(insertFn, /didit_sessions_pkey/);
assert.match(insertFn, /\.eq\("session_id", input\.sessionId\)/);
assert.match(insertFn, /ownerId === currentUserId/);
assert.doesNotMatch(insertFn, /\.upsert\(/);
assert.doesNotMatch(insertFn, /onConflict/);
assert.doesNotMatch(insertFn, /getSupabaseServiceRoleClient/);

assert.equal(
  isDiditSessionPrimaryKeyConflict({
    code: "23505",
    message: 'duplicate key value violates unique constraint "didit_sessions_pkey"'
  }),
  true
);
assert.equal(
  isDiditSessionPrimaryKeyConflict({
    code: "42501",
    message: "permission denied for table didit_sessions"
  }),
  false
);

const diditLib = read("lib/identity/didit.ts");
assert.doesNotMatch(diditLib, /from ["']node:crypto["']/);
assert.match(diditLib, /DIDIT_WORKFLOW_ID/);

const identityClientLib = read("lib/identity/identity-verification.ts");
assert.doesNotMatch(identityClientLib, /from ["']node:crypto["']|didit-signature/);

const middleware = read("middleware.ts");
assert.match(middleware, /api\/webhooks\//);

const webhookRoute = read("app/api/webhooks/didit/route.ts");
assert.match(webhookRoute, /x-signature-v2/);
assert.match(webhookRoute, /x-timestamp/);
assert.match(webhookRoute, /verifyDiditWebhook/);
assert.match(webhookRoute, /alreadyProcessedDiditEvent/);
assert.match(webhookRoute, /applyDiditWebhookDecision/);
assert.doesNotMatch(webhookRoute, /process\.env\.DIDIT_API_KEY/);

const clientButton = read("app/verify/VerifyButton.tsx");
assert.match(clientButton, /@didit-protocol\/sdk-web/);
assert.match(clientButton, /DiditSdk\.shared\.startVerification/);
assert.match(clientButton, /\/api\/verify/);
assert.doesNotMatch(clientButton, /DIDIT_API_KEY|DIDIT_WEBHOOK_SECRET/);

const form = read("components/identity/identity-verification-form.tsx");
assert.match(form, /startDiditVerification/);
assert.match(form, /\/api\/verify/);
assert.match(form, /consent/);
assert.match(form, /Didit/);
assert.doesNotMatch(form, /hyp-register|DIDIT_API_KEY/);

const donePage = read("app/verify/done/page.tsx");
assert.match(donePage, /זה אינו אישור שהזהות אומתה/);

assert.equal(mapDiditStatusToProfile("Approved", "pending"), "verified");
assert.equal(mapDiditStatusToProfile("Declined", "pending"), "failed");
assert.equal(mapDiditStatusToProfile("In Review", "unverified"), "pending");
assert.equal(mapDiditStatusToProfile("Resubmitted", "unverified"), "pending");
assert.equal(mapDiditStatusToProfile("In Progress", "unverified"), "pending");
assert.equal(mapDiditStatusToProfile("Awaiting User", "unverified"), "pending");
assert.equal(mapDiditStatusToProfile("Not Started", "unverified"), "pending");
assert.equal(mapDiditStatusToProfile("Abandoned", "pending"), "unverified");
assert.equal(mapDiditStatusToProfile("Expired", "pending"), "unverified");
assert.equal(mapDiditStatusToProfile("Kyc Expired", "verified"), "unverified");
assert.equal(mapDiditStatusToProfile("In Progress", "verified"), "verified");
assert.equal(mapDiditStatusToProfile("Abandoned", "verified"), "verified");

assert.equal(shouldKeepDiditPending("In Review", "2000-01-01T00:00:00.000Z"), true);
assert.equal(shouldKeepDiditPending("Approved", new Date().toISOString()), false);
assert.equal(shouldKeepDiditPending("In Progress", new Date().toISOString()), true);
assert.equal(shouldKeepDiditPending("In Progress", "2000-01-01T00:00:00.000Z"), false);

const payload = {
  event_id: "evt-1",
  webhook_type: "status.updated",
  status: "Approved",
  session_id: "4c5c7f3a-1111-4222-8333-444444444444",
  vendor_data: "11111111-1111-4111-8111-111111111111",
  score: 1.0,
  nested: { b: 2, a: 1 }
};
const canonical = canonicalizeDiditWebhookBody(payload);
assert.match(canonical, /"a":1/);
assert.doesNotMatch(canonical, /1\.0/);
const keys = Object.keys(JSON.parse(canonical) as Record<string, unknown>);
assert.deepEqual(keys, [...keys].sort());

const secret = "test-webhook-secret";
const signature = hmacSha256Hex(secret, canonical);
const now = 1_700_000_000_000;
const ok = verifyDiditWebhook({
  rawBody: JSON.stringify(payload),
  signature,
  timestampHeader: String(Math.floor(now / 1000)),
  secret,
  nowMs: now
});
assert.equal(ok.ok, true);

const stale = verifyDiditWebhook({
  rawBody: JSON.stringify(payload),
  signature,
  timestampHeader: String(Math.floor(now / 1000) - 400),
  secret,
  nowMs: now
});
assert.equal(stale.ok, false);
if (!stale.ok) assert.equal(stale.error, "stale");

const badSig = verifyDiditWebhook({
  rawBody: JSON.stringify(payload),
  signature: "0".repeat(signature.length),
  timestampHeader: String(Math.floor(now / 1000)),
  secret,
  nowMs: now
});
assert.equal(badSig.ok, false);
if (!badSig.ok) assert.equal(badSig.error, "bad_sig");

console.log("Didit KYC checks passed.");
