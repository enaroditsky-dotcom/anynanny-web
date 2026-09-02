import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  availableManualPaymentMethods,
  availableParentReceivingMethodsFromDestinations,
  availableParentReceivingMethodsFromPayoutMethods,
  canReportManualPayment,
  emptyManualPaymentDestinations,
  hasUsableDigitalReceivingMethod,
  isManualPaymentMethodUsable,
  isParentWalletPlaceholderMethod,
  PARENT_NO_DIGITAL_RECEIVING_COPY,
  PARENT_WALLET_SELECTABLE_METHODS,
  parentReceivingAvailabilityFromDestinations,
  parentReceivingAvailabilityFromPayoutMethods,
  sanitizeManualPaymentDestinations,
  sitterReceivingSetupState
} from "../lib/billing/payment-method-availability";
import {
  eligibleManualPaymentMethods,
  type ManualPaymentDestinations
} from "../lib/billing/manual-payment-ui";
import { EMPTY_SITTER_PAYOUT_METHODS } from "../lib/wallet/sitter-payout-methods";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const panel = read("components/billing/ManualPaymentPanel.tsx");
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const parentWallet = read("app/parent/wallet/wallet-client.tsx");
const sitterWallet = read("components/sitter/SitterPayoutWalletCards.tsx");
const receiving = read("components/sitter/SitterManualReceivingDestinationsSection.tsx");
const reportRoute = read("app/api/parent/report-manual-payment/route.ts");
const destinationsServer = read("lib/billing/parent-manual-payment-server.ts");
const paymentFactory = read("components/billing/PaymentFactory.tsx");
const walletBrand = read("components/wallet/wallet-method-brand.tsx");

const VALID_BIT = "0501234567";
const VALID_PAYBOX_LINK = "https://links.payboxapp.com/BERDOOz1ZUb";

function destinations(input: {
  bit?: string;
  payboxPhone?: string;
  payboxLink?: string;
  bitAvailable?: boolean;
  payboxAvailable?: boolean;
}): ManualPaymentDestinations {
  return {
    bookingId: "booking-1",
    cash: { available: true },
    bit:
      input.bitAvailable === false
        ? { available: false, destination: input.bit }
        : input.bit
          ? { available: true, destination: input.bit }
          : { available: false },
    paybox:
      input.payboxAvailable === false
        ? { available: false, destination: input.payboxPhone, link: input.payboxLink }
        : input.payboxPhone || input.payboxLink
          ? {
              available: true,
              destination: input.payboxPhone,
              link: input.payboxLink
            }
          : { available: false }
  };
}

// 1. Bit configured, PayBox missing → Parent sees only Bit (+ cash)
{
  const dest = destinations({ bit: VALID_BIT });
  assert.deepEqual(availableParentReceivingMethodsFromDestinations(dest), ["bit"]);
  assert.deepEqual(availableManualPaymentMethods(dest), ["cash", "bit"]);
  assert.equal(canReportManualPayment("bit", dest), true);
  assert.equal(canReportManualPayment("paybox", dest), false);
}

// 2. PayBox configured, Bit missing → Parent sees only PayBox (+ cash)
{
  const dest = destinations({ payboxLink: VALID_PAYBOX_LINK });
  assert.deepEqual(availableParentReceivingMethodsFromDestinations(dest), ["paybox"]);
  assert.deepEqual(availableManualPaymentMethods(dest), ["cash", "paybox"]);
  assert.equal(canReportManualPayment("paybox", dest), true);
  assert.equal(canReportManualPayment("bit", dest), false);
}

// 3. Both configured → Parent sees both
{
  const dest = destinations({ bit: VALID_BIT, payboxPhone: "0521234567" });
  assert.deepEqual(availableParentReceivingMethodsFromDestinations(dest), ["bit", "paybox"]);
  assert.deepEqual(availableManualPaymentMethods(dest), ["cash", "bit", "paybox"]);
}

// 4. Neither configured → no fake method, empty state
{
  const dest = emptyManualPaymentDestinations("booking-1");
  assert.deepEqual(availableParentReceivingMethodsFromDestinations(dest), []);
  assert.deepEqual(availableManualPaymentMethods(dest), ["cash"]);
  assert.equal(hasUsableDigitalReceivingMethod(dest), false);
  assert.match(panel, /PARENT_NO_DIGITAL_RECEIVING_COPY/);
  assert.equal(PARENT_NO_DIGITAL_RECEIVING_COPY, "לבייביסיטר עדיין לא הוגדר אמצעי לקבלת תשלום.");
  assert.match(panel, /canReportManualPayment/);
}

// 5. Malformed PayBox saved → unavailable
{
  const dest = destinations({
    payboxLink: "http://links.payboxapp.com/abc",
    payboxAvailable: true
  });
  assert.deepEqual(availableParentReceivingMethodsFromDestinations(dest), []);
  assert.equal(canReportManualPayment("paybox", dest), false);
  assert.equal(isManualPaymentMethodUsable("paybox", dest), false);
}

// 6. Blank PayBox → unavailable
{
  const dest = destinations({ payboxPhone: "   ", payboxLink: "", payboxAvailable: true });
  assert.deepEqual(availableParentReceivingMethodsFromDestinations(dest), []);
  assert.equal(isManualPaymentMethodUsable("paybox", dest), false);
}

// 7. Invalid Bit destination → unavailable
{
  const dest = destinations({ bit: "12345", bitAvailable: true });
  assert.deepEqual(availableParentReceivingMethodsFromDestinations(dest), []);
  assert.equal(canReportManualPayment("bit", dest), false);
  assert.equal(isManualPaymentMethodUsable("bit", dest), false);
}

// 8. Inactive setup card on Sitter side remains visible as setup
{
  const setup = sitterReceivingSetupState(EMPTY_SITTER_PAYOUT_METHODS, "bit");
  assert.equal(setup.configured, false);
  assert.equal(setup.statusLabel, "Bit לא הוגדר");
  assert.equal(setup.actionLabel, "הוספת Bit");
  assert.match(receiving, /sitterReceivingSetupState/);
  assert.match(receiving, /Bit לא הוגדר|statusLabel/);
  assert.match(sitterWallet, /sitterReceivingSetupState/);
  assert.match(sitterWallet, /הוספת Bit|actionLabel/);
}

// 9. Inactive Sitter method is never exposed as Parent payment option
{
  const payout = {
    ...EMPTY_SITTER_PAYOUT_METHODS,
    bitPhone: "not-a-phone",
    payboxPhone: "",
    payboxLink: "javascript:alert(1)"
  };
  assert.deepEqual(availableParentReceivingMethodsFromPayoutMethods(payout), []);
  assert.equal(parentReceivingAvailabilityFromPayoutMethods(payout).bit.usable, false);
  assert.equal(parentReceivingAvailabilityFromPayoutMethods(payout).paybox.usable, false);
}

// 10. Future / placeholder provider is never selectable
assert.deepEqual([...PARENT_WALLET_SELECTABLE_METHODS], ["credit_card"]);
assert.equal(isParentWalletPlaceholderMethod("apple_pay"), true);
assert.equal(isParentWalletPlaceholderMethod("google_pay"), true);
assert.doesNotMatch(parentWallet, /apple_pay|google_pay/);
assert.doesNotMatch(parentWallet, /הגדר כמועדף/);
assert.doesNotMatch(panel, /Apple Pay|Google Pay|כרטיס אשראי|Stripe|Grow/);
assert.doesNotMatch(dashboard, /PaymentFactory/);
assert.match(paymentFactory, /apple_pay/);
assert.doesNotMatch(dashboard, /from \"@\/components\/billing\/PaymentFactory\"/);

// 11. Post-shift flow uses the same availability model
assert.match(panel, /availableManualPaymentMethods/);
assert.match(panel, /sanitizeManualPaymentDestinations/);
assert.match(dashboard, /canReportManualPayment/);
assert.match(dashboard, /sanitizeManualPaymentDestinations/);
assert.match(dashboard, /\/api\/parent\/manual-payment-destinations/);

// 12. Parent wallet uses the same availability model
assert.match(parentWallet, /PARENT_WALLET_SELECTABLE_METHODS/);
assert.match(parentWallet, /תשלום משמרת מתבצע לפי אמצעי הקבלה/);

// 13. Sitter wallet visually distinguishes configured vs not configured
assert.match(sitterWallet, /sitterReceivingDetailStatus/);
assert.match(sitterWallet, /Bit ו-PayBox הם אמצעי קבלה מההורים/);
assert.match(walletBrand, /לא הוגדר/);
assert.match(walletBrand, /מחובר/);
{
  const configured = sitterReceivingSetupState(
    { ...EMPTY_SITTER_PAYOUT_METHODS, bitPhone: VALID_BIT },
    "bit"
  );
  assert.equal(configured.configured, true);
  assert.equal(configured.statusLabel, "Bit מחובר");
  const payboxLinkOnly = sitterReceivingSetupState(
    { ...EMPTY_SITTER_PAYOUT_METHODS, payboxLink: VALID_PAYBOX_LINK },
    "paybox"
  );
  assert.equal(payboxLinkOnly.configured, true);
  assert.equal(payboxLinkOnly.statusLabel, "PayBox מחובר");
}

// 14. Server rejects unavailable payment-method selection
assert.match(reportRoute, /methodHasAuthorizedDestination/);
assert.match(destinationsServer, /isManualPaymentMethodUsable/);
assert.match(destinationsServer, /sanitizeManualPaymentDestinations/);
assert.equal(isManualPaymentMethodUsable("bit", emptyManualPaymentDestinations("b1")), false);
assert.equal(isManualPaymentMethodUsable("paybox", emptyManualPaymentDestinations("b1")), false);
assert.equal(isManualPaymentMethodUsable("cash", emptyManualPaymentDestinations("b1")), true);

// 15. Existing valid Bit flow still works
{
  const dest = destinations({ bit: "050-123-4567" });
  const sanitized = sanitizeManualPaymentDestinations(dest);
  assert.equal(sanitized?.bit.available, true);
  assert.equal(sanitized?.bit.destination, "050-123-4567");
  assert.equal(canReportManualPayment("bit", dest), true);
  assert.equal(isManualPaymentMethodUsable("bit", dest), true);
}

// 16. Existing valid PayBox flow still works (phone or link)
{
  const phone = destinations({ payboxPhone: VALID_BIT });
  const link = destinations({ payboxLink: VALID_PAYBOX_LINK });
  assert.equal(canReportManualPayment("paybox", phone), true);
  assert.equal(canReportManualPayment("paybox", link), true);
  assert.equal(isManualPaymentMethodUsable("paybox", link), true);
}

// 17. No crash when payout-method data is missing/null
assert.deepEqual(availableParentReceivingMethodsFromPayoutMethods(null), []);
assert.deepEqual(availableParentReceivingMethodsFromDestinations(null), []);
assert.deepEqual(availableManualPaymentMethods(null), ["cash"]);
assert.equal(canReportManualPayment("bit", null), false);
assert.equal(canReportManualPayment("cash", null), true);
assert.equal(sitterReceivingSetupState(null, "paybox").configured, false);
assert.equal(sanitizeManualPaymentDestinations(null), null);
assert.deepEqual(parentReceivingAvailabilityFromDestinations(undefined), {
  bit: { configured: false, usable: false },
  paybox: { configured: false, usable: false }
});

assert.deepEqual(
  eligibleManualPaymentMethods({ bitConfigured: true, payboxConfigured: false }),
  ["cash", "bit"]
);

console.log("test-payment-method-availability: PASS");
