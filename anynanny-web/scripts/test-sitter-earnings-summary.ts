import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeSitterEarnings } from "../lib/wallet/sitter-wallet";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const asOf = new Date(2026, 7, 24, 12, 0, 0); // 24 Aug 2026 local
const localIso = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day, 12, 0, 0).toISOString();

const summary = summarizeSitterEarnings(
  [
    { id: "e1", type: "earnings", amount: 120, status: "succeeded", created_at: localIso(2026, 7, 10), booking_id: "b1" },
    { id: "e2", type: "earnings", amount: 80.5, status: "succeeded", created_at: localIso(2026, 7, 20), booking_id: "b2" },
    { id: "e3", type: "bonus", amount: 20, status: "succeeded", created_at: localIso(2026, 7, 21) },
    { id: "e4", type: "earnings", amount: 200, status: "succeeded", created_at: localIso(2026, 0, 15), booking_id: "b3" },
    { id: "e5", type: "earnings", amount: 50, status: "pending", created_at: localIso(2026, 7, 22), booking_id: "b4" },
    { id: "e6", type: "earnings", amount: 40, status: "failed", created_at: localIso(2026, 7, 22), booking_id: "b5" },
    { id: "e7", type: "payout", amount: 90, status: "succeeded", created_at: localIso(2026, 7, 23) },
    { id: "e8", type: "earnings", amount: 15, status: "succeeded", created_at: localIso(2025, 11, 31), booking_id: "b6" }
  ],
  asOf
);

assert.equal(summary.monthEarnings, 220.5);
assert.equal(summary.yearEarnings, 420.5);
assert.equal(summary.monthShiftCount, 2);

const empty = summarizeSitterEarnings([], asOf);
assert.equal(empty.monthEarnings, 0);
assert.equal(empty.yearEarnings, 0);
assert.equal(empty.monthShiftCount, 0);

const duplicateBooking = summarizeSitterEarnings(
  [
    { id: "d1", type: "earnings", amount: 10, status: "succeeded", created_at: localIso(2026, 7, 1), booking_id: "same" },
    { id: "d2", type: "earnings", amount: 10, status: "succeeded", created_at: localIso(2026, 7, 2), booking_id: "same" }
  ],
  asOf
);
assert.equal(duplicateBooking.monthEarnings, 20);
assert.equal(duplicateBooking.monthShiftCount, 1);

const page = read("app/sitter/wallet/page.tsx");
assert.match(page, /הארנק שלי/);
assert.match(page, /עיבוד מאובטח דרך שער התשלומים HYP/);
assert.match(page, /הכנסות החודש/);
assert.match(page, /סה״כ מתחילת השנה/);
assert.match(page, /משמרות החודש/);
assert.match(page, /אמצעי קבלת התשלום|SitterPayoutWalletCards/);
assert.match(page, /הכנסות ותשלומים/);
assert.match(page, /useState\(false\)/);
assert.match(page, /aria-expanded=\{historyOpen\}/);
assert.doesNotMatch(page, /יתרה זמינה למשיכה/);
assert.doesNotMatch(page, /היתרה שלך הזמינה למשיכה/);
assert.doesNotMatch(page, /setBalance/);

const payoutCards = read("components/sitter/SitterPayoutWalletCards.tsx");
assert.match(payoutCards, /אמצעי קבלת התשלום/);

console.log("Sitter earnings summary checks passed.");
