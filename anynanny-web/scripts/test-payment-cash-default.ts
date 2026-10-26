import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MANUAL_PAYMENT_PAID_BUTTON } from "../lib/billing/manual-payment-ui";
import { effectiveManualPaymentMethods } from "../lib/billing/payment-method-availability";
import {
  displayedPayoutEnabledMethods,
  enabledMethodsFromLegacyPreferred,
  togglePayoutEnabledMethod
} from "../lib/wallet/sitter-payout-methods";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const migration = read("supabase/migrations/20261026160000_sitter_payout_enabled_methods.sql");
const receiving = read("components/sitter/SitterManualReceivingDestinationsSection.tsx");
const walletCards = read("components/sitter/SitterPayoutWalletCards.tsx");
const payoutRoute = read("app/api/sitter/payout-methods/route.ts");
const payoutLib = read("lib/wallet/sitter-payout-methods.ts");
const destinationsServer = read("lib/billing/parent-manual-payment-server.ts");
const panel = read("components/billing/ManualPaymentPanel.tsx");
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const reportRoute = read("app/api/parent/report-manual-payment/route.ts");

function visible(
  enabledMethods: readonly string[] | null,
  bitConfigured: boolean,
  payboxConfigured: boolean
) {
  return effectiveManualPaymentMethods({ enabledMethods, bitConfigured, payboxConfigured });
}

assert.deepEqual(visible(null, false, false), ["cash"]);
assert.deepEqual(visible(null, true, true), ["cash"]);
assert.deepEqual(visible([], true, true), ["cash"]);
assert.deepEqual(visible(["cash"], true, true), ["cash"]);
assert.deepEqual(visible(["bit"], true, true), ["bit"]);
assert.deepEqual(visible(["paybox"], true, true), ["paybox"]);
assert.deepEqual(visible(["cash", "bit"], true, false), ["cash", "bit"]);
assert.deepEqual(visible(["cash", "paybox"], false, true), ["cash", "paybox"]);
assert.deepEqual(visible(["bit", "paybox"], true, true), ["bit", "paybox"]);
assert.deepEqual(visible(["cash", "bit", "paybox"], true, true), ["cash", "bit", "paybox"]);
assert.deepEqual(visible(["bit"], false, true), []);
assert.deepEqual(visible(["paybox"], true, false), []);
assert.deepEqual(visible(["bit", "paybox"], false, false), []);

assert.equal(enabledMethodsFromLegacyPreferred("cash")?.join(), "cash");
assert.equal(enabledMethodsFromLegacyPreferred("bit")?.join(), "bit");
assert.equal(enabledMethodsFromLegacyPreferred("paybox")?.join(), "paybox");
assert.equal(enabledMethodsFromLegacyPreferred(null), null);
assert.equal(enabledMethodsFromLegacyPreferred(""), null);
assert.equal(enabledMethodsFromLegacyPreferred("   "), null);
assert.equal(enabledMethodsFromLegacyPreferred("bank"), null);
assert.equal(enabledMethodsFromLegacyPreferred("card"), null);
assert.deepEqual(visible(enabledMethodsFromLegacyPreferred(null), true, true), ["cash"]);
assert.deepEqual(visible(enabledMethodsFromLegacyPreferred("bank"), true, true), ["cash"]);
assert.deepEqual(visible(enabledMethodsFromLegacyPreferred("card"), true, true), ["cash"]);
assert.deepEqual(displayedPayoutEnabledMethods(null), ["cash"]);
assert.deepEqual(displayedPayoutEnabledMethods([]), ["cash"]);
assert.deepEqual(togglePayoutEnabledMethod(null, "bit", true), ["cash", "bit"]);
assert.deepEqual(togglePayoutEnabledMethod(["bit"], "bit", false), []);

const phoneSave = receiving.slice(
  receiving.indexOf("async function saveReceivingPhone"),
  receiving.indexOf("export function SitterManualReceivingDestinationsSection")
);
assert.match(phoneSave, /preferred: false/);
assert.doesNotMatch(phoneSave, /enabled\s*:/);
assert.doesNotMatch(phoneSave, /enabledMethods/);

const bitSave = payoutRoute.slice(
  payoutRoute.indexOf('if (kind === "bit")'),
  payoutRoute.indexOf('if (kind === "paybox")')
);
const payboxSave = payoutRoute.slice(
  payoutRoute.indexOf('if (kind === "paybox")'),
  payoutRoute.indexOf('if (kind === "cash")')
);
assert.match(bitSave, /\{ bitPhone \}/);
assert.doesNotMatch(bitSave, /enabledMethods|preferred:/);
assert.doesNotMatch(payboxSave, /enabledMethods|preferred:/);
assert.match(payoutRoute, /togglePayoutEnabledMethod/);
assert.match(payoutLib, /payout_enabled_methods = patch\.enabledMethods/);
assert.doesNotMatch(payoutLib, /create table|alter table/i);

assert.match(migration, /add column if not exists payout_enabled_methods text\[\]/);
assert.match(migration, /p_methods <@ array\['cash', 'bit', 'paybox'\]::text\[\]/);
assert.match(migration, /count\(distinct method\)/);
assert.match(
  migration,
  /set payout_enabled_methods = array\[lower\(btrim\(payout_preferred_method\)\)\]::text\[\]/
);
assert.match(
  migration,
  /lower\(btrim\(coalesce\(payout_preferred_method, ''\)\)\) in \('cash', 'bit', 'paybox'\)/
);
assert.match(
  migration,
  /where lower\(btrim\(coalesce\(payout_preferred_method, ''\)\)\) in \('bank', 'card'\)/
);
assert.doesNotMatch(migration, /drop column[^;]*payout_preferred_method/i);
assert.doesNotMatch(migration, /update\s+public\.bookings/i);
assert.doesNotMatch(migration, /payment_status\s*=/i);
assert.match(migration, /v_show_cash :=/);
assert.match(migration, /v_enabled is null/);
assert.match(migration, /cardinality\(v_enabled\) = 0/);
assert.match(migration, /'bit' = any \(v_enabled\)/);
assert.match(migration, /'paybox' = any \(v_enabled\)/);
assert.match(migration, /if not v_show_bit then/);
assert.match(migration, /if not v_show_paybox then/);
assert.match(migration, /'enabled_methods', to_jsonb\(v_enabled\)/);
assert.match(destinationsServer, /parsePayoutEnabledMethods/);
assert.match(destinationsServer, /enabledMethodsFromLegacyPreferred/);
assert.doesNotMatch(destinationsServer, /paybox_link/);

assert.match(walletCards, /אמצעי קבלת תשלום/);
assert.match(walletCards, /בחרי אילו אמצעי תשלום יהיו זמינים לקבלת תשלומים מההורים\./);
assert.match(receiving, /זמין לקבלת תשלומים/);
assert.match(receiving, /enableToggle\("cash"\)/);
assert.match(receiving, /enableToggle\("bit"\)/);
assert.match(receiving, /enableToggle\("paybox"\)/);

assert.match(panel, /onClick=\{\(\) => onSelectMethod\(id\)\}/);
assert.doesNotMatch(panel, /onClick=\{\(\) => onReportPaid\(\)\}/);
assert.match(dashboard, /onSelectMethod=\{setManualPaymentMethod\}/);
assert.match(dashboard, /onReportPaid=\{\(\) => void handleReportManualPayment\(\)\}/);
assert.equal(MANUAL_PAYMENT_PAID_BUTTON, "שילמתי");
assert.match(panel, /MANUAL_PAYMENT_PAID_BUTTON/);
assert.match(reportRoute, /report_manual_payment/);
assert.doesNotMatch(panel, /target="_blank"|bitpay|payboxapp|bit:\/\/|paybox:\/\//);

console.log("test-payment-cash-default: PASS");
