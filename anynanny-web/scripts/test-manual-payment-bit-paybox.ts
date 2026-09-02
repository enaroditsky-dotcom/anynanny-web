import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateManualPaymentTransition } from "../lib/billing/manual-payment-lifecycle";
import {
  eligibleManualPaymentMethods,
  parentMayReadManualPaymentDestinations,
  parentReportedPaidByMethodCopy,
  sitterManualPaymentPromptForMethod
} from "../lib/billing/manual-payment-ui";
import {
  validateOptionalBitPhone,
  validateOptionalPayboxPhone
} from "../lib/wallet/sitter-payout-methods";
import { privacySafeBodyForKind } from "../lib/push/payload";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const personal = read("components/sitter/sitter-personal-area.tsx");
const receiving = read("components/sitter/SitterManualReceivingDestinationsSection.tsx");
const payoutRoute = read("app/api/sitter/payout-methods/route.ts");
const destinationsServer = read("lib/billing/parent-manual-payment-server.ts");
const destinationsRoute = read("app/api/parent/manual-payment-destinations/route.ts");
const reportRoute = read("app/api/parent/report-manual-payment/route.ts");
const panel = read("components/billing/ManualPaymentPanel.tsx");
const parentDash = read("components/parent/parent-dashboard-client.tsx");
const sitterPanel = read("components/session/sitter-manual-payment-confirm-panel.tsx");
const migration = read("supabase/migrations/20260902120000_parent_manual_payment_destinations.sql");
const columnPrivs = read(
  "supabase/migrations/20260902130000_sitter_payout_phones_column_privileges.sql"
);
const selectGrants = read(
  "supabase/migrations/20260902131000_sitter_payout_phones_select_grants.sql"
);
const payoutMethodsLib = read("lib/wallet/sitter-payout-methods.ts");
const publicProfile = read("lib/sitter/fetch-parent-sitter-profile.ts");
const publicSearch = read("lib/sitter/parent-sitter-search.ts");
const publicApi = read("app/api/parent/sitter/[id]/public/route.ts");
const walletPage = read("app/sitter/wallet/page.tsx");
const hypFinalize = read("lib/billing/finalize-hyp-payment.ts");

// 1–4. Visibility by sitter configuration
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: true, payboxConfigured: false }), [
  "cash",
  "bit"
]);
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: false, payboxConfigured: true }), [
  "cash",
  "paybox"
]);
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: true, payboxConfigured: true }), [
  "cash",
  "bit",
  "paybox"
]);
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: false, payboxConfigured: false }), [
  "cash"
]);
assert.match(panel, /eligibleManualPaymentMethods/);
assert.match(panel, /bitConfigured: destinations\?\.bit.available === true/);
assert.match(panel, /manualPaymentDestinationInstruction/);
assert.match(parentDash, /\/api\/parent\/manual-payment-destinations/);

// Sitter Personal Area configuration — optional, independent, Hebrew
assert.match(personal, /SitterManualReceivingDestinationsSection/);
assert.match(receiving, /קבלה ב-Bit וב-PayBox/);
assert.match(receiving, /שמירת Bit/);
assert.match(receiving, /שמירת PayBox/);
assert.match(receiving, /preferred: false/);
assert.match(receiving, /validateOptionalBitPhone/);
assert.match(receiving, /validateOptionalPayboxPhone/);
assert.doesNotMatch(receiving, /form\.phone|whatsapp|referee_phone/);
assert.equal(validateOptionalBitPhone(""), null);
assert.equal(validateOptionalPayboxPhone(""), null);
assert.ok(validateOptionalBitPhone("123") != null);
assert.equal(validateOptionalBitPhone("0501234567"), null);

assert.match(payoutRoute, /validateOptionalBitPhone/);
assert.match(payoutRoute, /validateOptionalPayboxPhone/);
assert.match(payoutRoute, /preferred: bitPhone\.trim\(\) && setPreferred \? "bit"/);

// Parent destinations RPC — no public exposure, no browser service role
assert.match(migration, /create or replace function public\.parent_manual_payment_destinations\(p_booking_id uuid\)/);
assert.match(migration, /manual_payment_booking_has_parent_rating/);
assert.match(migration, /payout_bit_phone/);
assert.match(migration, /payout_paybox_phone/);
assert.match(migration, /grant execute on function public\.parent_manual_payment_destinations\(uuid\) to authenticated/);
assert.match(migration, /revoke all on function public\.parent_manual_payment_destinations\(uuid\) from anon/);
assert.match(destinationsServer, /parent_manual_payment_destinations/);
assert.match(destinationsRoute, /loadAuthorizedManualPaymentDestinations/);
assert.doesNotMatch(destinationsRoute, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(parentDash, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
assert.doesNotMatch(receiving, /SUPABASE_SERVICE_ROLE_KEY|service_role/);

assert.equal(
  parentMayReadManualPaymentDestinations({
    actorId: "p1",
    bookingParentId: "p1",
    bookingStatus: "completed",
    paymentStatus: "unpaid",
    hasParentRating: true
  }).ok,
  true
);
assert.equal(
  parentMayReadManualPaymentDestinations({
    actorId: "p1",
    bookingParentId: "p1",
    bookingStatus: "completed",
    paymentStatus: "unpaid",
    hasParentRating: false
  }).ok,
  false
);

assert.doesNotMatch(publicProfile, /payout_bit_phone|payout_paybox_phone/);
assert.doesNotMatch(publicSearch, /payout_bit_phone|payout_paybox_phone/);
assert.doesNotMatch(publicApi, /payout_bit_phone|payout_paybox_phone/);
assert.match(publicApi, /sanitized JSON only via get_sitter_profile_public/);

assert.match(columnPrivs, /revoke select \(payout_bit_phone, payout_paybox_phone\)/);
assert.match(columnPrivs, /from anon/);
assert.match(columnPrivs, /from authenticated/);
assert.match(columnPrivs, /sitter_own_manual_payout_destinations/);
assert.match(selectGrants, /revoke select on public\.sitter_profiles from anon/);
assert.match(selectGrants, /revoke select on public\.sitter_profiles from authenticated/);
assert.match(selectGrants, /grant select \(%s\) on public\.sitter_profiles to anon/);
assert.match(selectGrants, /column_name not in \('payout_bit_phone', 'payout_paybox_phone'\)/);
assert.doesNotMatch(selectGrants, /bookings_insert_parent|get_sitter_profile_public|list_public_sitters_search/);
assert.match(columnPrivs, /grant execute on function public\.sitter_own_manual_payout_destinations\(\) to authenticated/);
assert.match(columnPrivs, /revoke all on function public\.sitter_own_manual_payout_destinations\(\) from anon/);
assert.doesNotMatch(columnPrivs, /bookings_insert_parent|get_sitter_profile_public|list_public_sitters_search/);
assert.match(payoutMethodsLib, /sitter_own_manual_payout_destinations/);
assert.doesNotMatch(
  payoutMethodsLib,
  /const PUBLIC_SELECT_COLS =\s*"payout_preferred_method, payout_bit_phone/
);

const sitterProfileApi = read("app/api/sitter/profile/route.ts");
const sitterProfileLib = read("lib/sitter/sitter-profile.ts");
assert.match(sitterProfileApi, /fetchOwnSitterProfileRow/);
assert.match(sitterProfileApi, /sitterProfileOwnSelectClause/);
assert.doesNotMatch(sitterProfileApi, /\.select\(["']\*["']\)/);
assert.match(sitterProfileLib, /SITTER_PROFILE_OWN_SELECT_COLUMNS/);
assert.match(sitterProfileLib, /fetchOwnSitterProfileRow/);
assert.doesNotMatch(
  sitterProfileLib.slice(
    sitterProfileLib.indexOf("SITTER_PROFILE_OWN_SELECT_COLUMNS"),
    sitterProfileLib.indexOf("export function isSitterProfilePrivatePayoutColumn")
  ),
  /payout_bit_phone|payout_paybox_phone|"user_id"/
);
assert.match(personal, /\/api\/sitter\/profile/);
assert.match(personal, /SitterManualReceivingDestinationsSection/);

// 5–7. Method-specific report + sitter prompt
assert.equal(parentReportedPaidByMethodCopy("cash"), "ההורה דיווח ששילם במזומן");
assert.equal(parentReportedPaidByMethodCopy("bit"), "ההורה דיווח ששילם ב-Bit");
assert.equal(parentReportedPaidByMethodCopy("paybox"), "ההורה דיווח ששילם ב-PayBox");
assert.equal(
  sitterManualPaymentPromptForMethod("bit"),
  "ההורה דיווח ששילם ב-Bit. האם קיבלת את התשלום?"
);
assert.equal(
  sitterManualPaymentPromptForMethod("paybox"),
  "ההורה דיווח ששילם ב-PayBox. האם קיבלת את התשלום?"
);
assert.equal(
  sitterManualPaymentPromptForMethod("cash"),
  "ההורה דיווח ששילם במזומן. האם קיבלת את התשלום?"
);
assert.match(sitterPanel, /sitterManualPaymentPromptForMethod/);
assert.match(reportRoute, /report_manual_payment/);
assert.match(reportRoute, /storedMethod/);
assert.equal(
  privacySafeBodyForKind("manual_payment_reported", { payment_method: "paybox" }),
  "ההורה דיווח ששילם ב-PayBox"
);

assert.deepEqual(
  evaluateManualPaymentTransition({
    action: "report",
    actor: "parent",
    paymentStatus: "unpaid",
    paymentMethod: "bit",
    hasParentRating: true,
    bookingStatus: "completed"
  }),
  { ok: true, nextStatus: "awaiting_sitter_confirmation", noop: false }
);

// 8–9. Confirm/deny/rating/HYP unchanged
assert.match(read("lib/billing/sitter-manual-payment-server.ts"), /confirm_manual_payment_received/);
assert.match(read("lib/ratings/submit-session-rating.ts"), /mark_manual_payment_paid_after_sitter_rating/);
assert.match(hypFinalize, /payment_status: "paid"/);
assert.doesNotMatch(hypFinalize, /parent_manual_payment_destinations/);
assert.match(walletPage, /SitterPayoutWalletCards/);
assert.doesNotMatch(receiving, /hyp-register|PaymentFactory|כרטיס אשראי/);

console.log("test-manual-payment-bit-paybox: PASS");
