import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateManualPaymentTransition } from "../lib/billing/manual-payment-lifecycle";
import {
  eligibleManualPaymentMethods,
  MANUAL_PAYMENT_PAID_BUTTON,
  MANUAL_PAYMENT_PAYBOX_OPEN_BUTTON,
  parentMayReadManualPaymentDestinations,
  parentReportedPaidByMethodCopy,
  sitterManualPaymentPromptForMethod
} from "../lib/billing/manual-payment-ui";
import {
  EMPTY_SITTER_PAYOUT_METHODS,
  payboxManualReceivingConfigured,
  payoutMethodConfigured,
  preferredReceivingMethodLabel,
  validateOptionalBitPhone,
  validateOptionalPayboxPhone
} from "../lib/wallet/sitter-payout-methods";
import {
  isValidPayboxPaymentLink,
  parseAuthorizedPayboxPaymentLink,
  validateOptionalPayboxPaymentLink
} from "../lib/billing/paybox-payment-link";
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
const payboxLinkMigration = read(
  "supabase/migrations/20260902140000_sitter_payout_paybox_link.sql"
);
const payboxLinkLib = read("lib/billing/paybox-payment-link.ts");

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
assert.match(panel, /availableManualPaymentMethods/);
assert.match(panel, /sanitizeManualPaymentDestinations/);
assert.match(panel, /canReportManualPayment/);
assert.match(panel, /manualPaymentDestinationInstruction/);
assert.match(parentDash, /\/api\/parent\/manual-payment-destinations/);

// Sitter Personal Area configuration — optional, independent, Hebrew
assert.match(personal, /SitterManualReceivingDestinationsSection/);
assert.match(receiving, /קבלה ב-Bit וב-PayBox/);
assert.match(receiving, /שמירת Bit/);
assert.match(receiving, /לינק אישי לקבלת תשלום ב-PayBox/);
assert.match(receiving, /שמירת לינק|עדכון לינק/);
assert.match(receiving, /מחיקת לינק/);
assert.match(receiving, /validateOptionalPayboxPaymentLink/);
assert.match(receiving, /payboxManualReceivingConfigured/);
assert.doesNotMatch(receiving, /paybox:\/\//);
assert.doesNotMatch(panel, /paybox:\/\//);
assert.doesNotMatch(panel, /bit:\/\//);
assert.match(receiving, /preferred: false/);
assert.match(receiving, /validateOptionalBitPhone/);
assert.match(receiving, /validateOptionalPayboxPhone/);
assert.match(receiving, /מזומן/);
assert.match(receiving, /kind: "cash"/);
assert.match(receiving, /בחירה כדרך קבלה מועדפת/);
assert.match(receiving, /savePreferredCash/);
assert.equal(preferredReceivingMethodLabel("cash"), "מזומן");
assert.equal(preferredReceivingMethodLabel("bit"), "Bit");
assert.equal(preferredReceivingMethodLabel("paybox"), "PayBox");
assert.equal(preferredReceivingMethodLabel("bank"), "העברה בנקאית");
assert.equal(preferredReceivingMethodLabel("card"), null);

assert.match(payoutRoute, /validateOptionalBitPhone/);
assert.match(payoutRoute, /validateOptionalPayboxPaymentLink/);
assert.match(payoutRoute, /payboxLink/);
assert.match(payoutRoute, /preferred: bitPhone\.trim\(\) && setPreferred \? "bit"/);
assert.match(payoutRoute, /kind === "cash"/);
assert.match(payoutRoute, /preferred: "cash"/);
assert.match(payoutMethodsLib, /preferredRaw === "cash"/);

const cashPreferredMigration = read(
  "supabase/migrations/20260904120000_sitter_payout_preferred_method_cash.sql"
);
assert.match(cashPreferredMigration, /add column if not exists payout_preferred_method text/);
assert.match(cashPreferredMigration, /drop constraint if exists sitter_profiles_payout_preferred_method_check/);
assert.match(
  cashPreferredMigration,
  /payout_preferred_method is null\s+or payout_preferred_method in \('bit', 'paybox', 'card', 'bank', 'cash'\)/
);
assert.match(
  cashPreferredMigration,
  /grant select \(payout_preferred_method\)\s+on public\.sitter_profiles\s+to authenticated/
);
assert.match(
  cashPreferredMigration,
  /grant update \(payout_preferred_method\)\s+on public\.sitter_profiles\s+to authenticated/
);
assert.match(cashPreferredMigration, /notify pgrst, 'reload schema'/);
assert.doesNotMatch(cashPreferredMigration, /to anon/);
assert.doesNotMatch(cashPreferredMigration, /to public/);
assert.doesNotMatch(cashPreferredMigration, /\brevoke\b/i);
assert.doesNotMatch(cashPreferredMigration, /enable row level security/i);
assert.doesNotMatch(cashPreferredMigration, /create policy|drop policy/i);
assert.doesNotMatch(cashPreferredMigration, /pg_constraint|pg_get_constraintdef/i);
assert.doesNotMatch(cashPreferredMigration, /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);
assert.doesNotMatch(cashPreferredMigration, /bank_account_number|payout_card_/);
assert.match(receiving, /PAYBOX_PERSONAL_LINK_HELP_TOGGLE/);
assert.match(receiving, /aria-expanded=\{payboxLinkHelpOpen\}/);
assert.match(receiving, /sitter-paybox-personal-link-help/);
assert.match(receiving, /HelpCircle/);
assert.match(receiving, /איך משתמשים בלינק האישי שלי ב-PayBox\?/);
assert.match(receiving, /הלינק צריך להתחיל ב:/);
assert.match(receiving, /https:\/\//);
assert.match(receiving, /פתחי את אפליקציית PayBox/);
assert.match(receiving, /select-text/);
assert.doesNotMatch(receiving, /form\.phone|referee_phone|whatsapp_phone|contactPhone/);
assert.equal(validateOptionalBitPhone(""), null);
assert.equal(validateOptionalPayboxPhone(""), null);
assert.ok(validateOptionalBitPhone("123") != null);
assert.equal(validateOptionalBitPhone("0501234567"), null);

assert.match(payoutRoute, /validateOptionalBitPhone/);
assert.match(payoutRoute, /validateOptionalPayboxPaymentLink/);
assert.match(payoutRoute, /payboxLink/);
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

assert.doesNotMatch(publicProfile, /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);
assert.doesNotMatch(publicSearch, /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);
assert.doesNotMatch(publicApi, /payout_bit_phone|payout_paybox_phone|payout_paybox_link/);
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
  /payout_bit_phone|payout_paybox_phone|payout_paybox_link|"user_id"/
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

// PayBox personal payment link
assert.match(payboxLinkMigration, /payout_paybox_link/);
assert.match(payboxLinkMigration, /add column if not exists payout_paybox_link text/);
assert.match(
  payboxLinkMigration,
  /revoke select \(payout_bit_phone, payout_paybox_phone, payout_paybox_link\)/
);
assert.match(payboxLinkMigration, /'paybox_link', nullif\(v_paybox_link, ''\)/);
assert.match(payboxLinkMigration, /manual_payment_booking_has_parent_rating/);
assert.match(payboxLinkLib, /links\.payboxapp\.com/);
assert.match(payboxLinkLib, /payboxapp\.page\.link/);
assert.doesNotMatch(payboxLinkLib, /paybox:\/\//);
assert.match(panel, /MANUAL_PAYMENT_PAYBOX_OPEN_BUTTON/);
assert.match(panel, /parseAuthorizedPayboxPaymentLink/);
assert.equal(MANUAL_PAYMENT_PAYBOX_OPEN_BUTTON, "פתח PayBox");
assert.equal(MANUAL_PAYMENT_PAID_BUTTON, "שילמתי");
assert.match(destinationsServer, /paybox_link/);
assert.match(destinationsServer, /parseAuthorizedPayboxPaymentLink/);
assert.match(payoutMethodsLib, /payboxLink/);
assert.match(payoutMethodsLib, /sitter_own_manual_payout_destinations/);
assert.doesNotMatch(payoutMethodsLib, /const PUBLIC_SELECT_COLS =\s*"payout_preferred_method, payout_bit_phone/);

assert.equal(validateOptionalPayboxPaymentLink(""), null);
assert.equal(validateOptionalPayboxPaymentLink("   "), null);
assert.ok(validateOptionalPayboxPaymentLink("javascript:alert(1)") != null);
assert.ok(validateOptionalPayboxPaymentLink("data:text/html,hi") != null);
assert.ok(validateOptionalPayboxPaymentLink("http://links.payboxapp.com/abc") != null);
assert.ok(validateOptionalPayboxPaymentLink("https://example.com/pay") != null);
assert.ok(validateOptionalPayboxPaymentLink("https://evilpayboxapp.com/x") != null);
assert.ok(validateOptionalPayboxPaymentLink("paybox://pay") != null);
assert.equal(
  validateOptionalPayboxPaymentLink("https://links.payboxapp.com/BERDOOz1ZUb"),
  null
);
assert.equal(validateOptionalPayboxPaymentLink(" https://www.payboxapp.com/pay/abc "), null);
assert.ok(isValidPayboxPaymentLink("https://payboxapp.page.link/xyz"));
assert.equal(
  parseAuthorizedPayboxPaymentLink("https://links.payboxapp.com/BERDOOz1ZUb"),
  "https://links.payboxapp.com/BERDOOz1ZUb"
);
assert.equal(parseAuthorizedPayboxPaymentLink("https://google.com"), null);

const phoneOnly = {
  ...EMPTY_SITTER_PAYOUT_METHODS,
  payboxPhone: "0501234567"
};
const linkOnly = {
  ...EMPTY_SITTER_PAYOUT_METHODS,
  payboxLink: "https://links.payboxapp.com/BERDOOz1ZUb"
};
const neither = { ...EMPTY_SITTER_PAYOUT_METHODS };
assert.equal(payoutMethodConfigured(phoneOnly, "paybox"), true);
assert.equal(payboxManualReceivingConfigured(phoneOnly), true);
assert.equal(payoutMethodConfigured(linkOnly, "paybox"), false);
assert.equal(payboxManualReceivingConfigured(linkOnly), true);
assert.equal(payboxManualReceivingConfigured(neither), false);
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: false, payboxConfigured: false }), [
  "cash"
]);
assert.deepEqual(eligibleManualPaymentMethods({ bitConfigured: false, payboxConfigured: true }), [
  "cash",
  "paybox"
]);

assert.equal(
  parentMayReadManualPaymentDestinations({
    actorId: "p1",
    bookingParentId: "p2",
    bookingStatus: "completed",
    paymentStatus: "unpaid",
    hasParentRating: true
  }).ok,
  false
);
assert.doesNotMatch(destinationsRoute, /sitterId/);

console.log("test-manual-payment-bit-paybox: PASS");
