import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preferredReceivingMethodLabel } from "../lib/wallet/sitter-payout-methods";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const personal = read("components/sitter/sitter-personal-area.tsx");
const receiving = read("components/sitter/SitterManualReceivingDestinationsSection.tsx");
const walletPage = read("app/sitter/wallet/page.tsx");
const walletCards = read("components/sitter/SitterPayoutWalletCards.tsx");
const walletBrand = read("components/wallet/wallet-method-brand.tsx");
const parentSitterPage = read("app/parent/sitter/[sitterId]/page.tsx");
const parentProfile = read("lib/sitter/fetch-parent-sitter-profile.ts");
const payoutRoute = read("app/api/sitter/payout-methods/route.ts");
const payoutLib = read("lib/wallet/sitter-payout-methods.ts");
const tourSteps = read("lib/product-tour/sitter-steps.ts");

// 1. Personal Area no longer shows payment receiving management
assert.doesNotMatch(personal, /SitterManualReceivingDestinationsSection/);
assert.doesNotMatch(personal, /data-tour="sitter-payment-methods"/);
assert.doesNotMatch(personal, /בחירת דרך קבלת התשלום/);
assert.doesNotMatch(personal, /שמירת Bit|שמירת PayBox|לינק אישי לקבלת תשלום ב-PayBox/);
assert.doesNotMatch(personal, /מזומן|PayBox|\bBit\b/);

// 2. Wallet shows payment receiving methods
assert.match(walletPage, /SitterPayoutWalletCards/);
assert.match(walletCards, /אמצעי קבלת התשלום/);
assert.match(walletCards, /SitterManualReceivingDestinationsSection/);
assert.match(walletCards, /data-tour="sitter-payment-methods"/);
assert.match(receiving, /kind="cash"/);
assert.match(receiving, /kind="bit"/);
assert.match(receiving, /kind="paybox"/);

// 3. Cash card shows BOTH banknote visual and visible label מזומן
assert.match(walletBrand, /export function CashWalletCard/);
assert.match(walletBrand, /export function CashBanknoteMark/);
assert.match(walletBrand, /from "lucide-react"/);
assert.match(walletBrand, /Banknote/);
assert.match(walletBrand, /<span>מזומן<\/span>/);
assert.match(walletBrand, /aria-label="מזומן"/);
assert.match(receiving, /cardTitle="מזומן"/);

// 4–6. Bit / PayBox / PayBox personal link load and save through existing actions
assert.match(receiving, /fetchSitterPayoutMethods/);
assert.match(receiving, /setBitPhone\(result\.methods\.bitPhone\)/);
assert.match(receiving, /setPayboxPhone\(result\.methods\.payboxPhone\)/);
assert.match(receiving, /setPayboxLink\(result\.methods\.payboxLink\)/);
assert.match(receiving, /validateOptionalBitPhone/);
assert.match(receiving, /validateOptionalPayboxPhone/);
assert.match(receiving, /validateOptionalPayboxPaymentLink/);
assert.match(receiving, /שמירת Bit/);
assert.match(receiving, /שמירת PayBox/);
assert.match(receiving, /לינק אישי לקבלת תשלום ב-PayBox/);
assert.match(receiving, /שמירת לינק|עדכון לינק/);
assert.match(receiving, /\/api\/sitter\/payout-methods/);
assert.match(payoutRoute, /payboxLink/);
assert.match(payoutLib, /payout_bit_phone/);
assert.match(payoutLib, /payout_paybox_phone/);
assert.match(payoutLib, /payout_paybox_link/);

// 7–8. Preferred method loads and can be changed from Wallet
assert.match(receiving, /preferredReceivingMethodLabel\(methods\.preferred\)/);
assert.match(receiving, /savePreferredMethod/);
assert.match(receiving, /preferredButton\("cash"\)/);
assert.match(receiving, /preferredButton\("bit"\)/);
assert.match(receiving, /preferredButton\("paybox"\)/);
assert.match(walletCards, /preferredReceivingMethodLabel\(methods\.preferred\)/);
assert.match(payoutRoute, /preferredOnly/);
assert.match(payoutRoute, /preferred: kind/);
assert.match(payoutLib, /payout_preferred_method/);

// 9. Parent-facing preferred method behavior is unchanged
assert.match(parentSitterPage, /preferredReceivingMethodLabel\(profile\?\.payout_preferred_method\)/);
assert.match(parentSitterPage, /דרך קבלת תשלום מועדפת:/);
assert.match(parentProfile, /payout_preferred_method/);
assert.equal(preferredReceivingMethodLabel("cash"), "מזומן");
assert.equal(preferredReceivingMethodLabel("bit"), "Bit");
assert.equal(preferredReceivingMethodLabel("paybox"), "PayBox");

// 10. Existing sitter data uses the same persisted columns
assert.match(payoutLib, /bitPhone: String\(row\.payout_bit_phone/);
assert.match(payoutLib, /payboxPhone: String\(row\.payout_paybox_phone/);
assert.match(payoutLib, /payboxLink: parseAuthorizedPayboxPaymentLink/);
assert.doesNotMatch(payoutLib, /create table|alter table/i);

// 11. Mobile-first Wallet modal
assert.match(walletCards, /AUTH_MODAL_CARD_SHELL_MD/);
assert.match(walletCards, /AUTH_MODAL_BODY_SCROLL/);

// 12. Sitter Product Tour teaches receiving methods from Wallet
assert.match(tourSteps, /SITTER_TOUR_WALLET_PATH/);
assert.match(tourSteps, /id: "sitter-payment-methods"/);
assert.match(tourSteps, /id: "sitter-preferred-payment"/);
assert.match(walletCards, /data-tour="sitter-preferred-payment"/);
assert.doesNotMatch(personal, /data-tour="sitter-preferred-payment"/);

// 13–14. No schema rewrite / no duplicate storage
assert.doesNotMatch(walletCards, /from\("sitter_receiving/);
assert.match(receiving, /\/api\/sitter\/payout-methods/);

const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: root,
  encoding: "utf8"
}).trim();
const gitFiles = execFileSync("git", ["status", "--porcelain", "--", "android", "twa"], {
  cwd: gitRoot,
  encoding: "utf8"
}).trim();
assert.equal(gitFiles, "", `Android/TWA files must be untouched, got:\n${gitFiles}`);

console.log("test-sitter-wallet-receiving-methods: PASS");
