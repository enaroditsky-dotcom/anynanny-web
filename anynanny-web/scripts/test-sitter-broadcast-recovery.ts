import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_SITTER_BROADCAST_RELEVANCE_MS,
  recoverActiveSitterBroadcast,
  isActiveSitterBroadcastStatus,
  isSitterBroadcastCreatedAtRelevant,
  isTerminalSitterBroadcastStatus,
  type SitterBroadcastRow
} from "../lib/broadcast/sitter-broadcast-recovery";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const CITY = "חיפה";
const OTHER_CITY = "תל אביב-יפו";
const NOW = Date.parse("2026-09-17T12:00:00.000Z");

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function activeRow(
  overrides?: Partial<SitterBroadcastRow>
): SitterBroadcastRow {
  return {
    id: "alert-1",
    city: CITY,
    service_type: "sitter",
    status: "active",
    created_at: isoAgo(0),
    ...overrides
  };
}

function recover(
  overrides: Partial<Parameters<typeof recoverActiveSitterBroadcast>[0]> & {
    rows: readonly SitterBroadcastRow[];
  }
) {
  return recoverActiveSitterBroadcast({
    sitterCities: [CITY],
    dismissedIds: new Set(),
    paused: false,
    currentId: null,
    nowMs: NOW,
    ...overrides
  });
}

function assertOpens(
  label: string,
  rows: readonly SitterBroadcastRow[],
  extra?: Partial<Parameters<typeof recoverActiveSitterBroadcast>[0]>
) {
  const result = recover({ rows, ...extra });
  assert.equal(result.open?.id, "alert-1", `${label}: expected to open`);
  assert.equal(result.clearCurrent, false, `${label}: should not clear`);
}

assert.equal(ACTIVE_SITTER_BROADCAST_RELEVANCE_MS, 2 * 60 * 60 * 1000);

// Live / recently created actives still recover (including after a short offline window).
assertOpens("T+30s", [activeRow({ created_at: isoAgo(30 * 1000) })]);
assertOpens("T+2min", [activeRow({ created_at: isoAgo(2 * 60 * 1000) })]);
assertOpens("T+5min", [activeRow({ created_at: isoAgo(5 * 60 * 1000) })]);
assertOpens("T+11min", [activeRow({ created_at: isoAgo(11 * 60 * 1000) })]);
assertOpens("T+90min", [activeRow({ created_at: isoAgo(90 * 60 * 1000) })]);

// Abandoned/stale active rows must not reopen for every sitter.
{
  const stale = recover({
    rows: [activeRow({ created_at: isoAgo(3 * 60 * 60 * 1000) })]
  });
  assert.equal(stale.open, null, "3h-old active must not open");
  assert.equal(stale.clearCurrent, false);
}

{
  const missingCreatedAt = recover({
    rows: [activeRow({ created_at: undefined })]
  });
  assert.equal(missingCreatedAt.open, null, "active without created_at must not open");
}

{
  const empty = recover({ rows: [] });
  assert.equal(empty.open, null, "empty catch-up must not invent an alert");
  assert.equal(empty.clearCurrent, false);
}

assert.equal(isSitterBroadcastCreatedAtRelevant(isoAgo(30 * 1000), NOW), true);
assert.equal(isSitterBroadcastCreatedAtRelevant(isoAgo(3 * 60 * 60 * 1000), NOW), false);
assert.equal(isSitterBroadcastCreatedAtRelevant("", NOW), false);
assert.equal(isSitterBroadcastCreatedAtRelevant(null, NOW), false);

// Sitter opens after being offline — catch-up with no current overlay.
{
  const result = recover({
    rows: [activeRow({ created_at: isoAgo(4 * 60 * 1000) })],
    currentId: null
  });
  assert.equal(result.open?.id, "alert-1");
  assert.equal(result.clearCurrent, false);
}

// Parent closed the app — row stays active within the relevance window.
{
  const result = recover({
    rows: [activeRow({ created_at: isoAgo(3 * 60 * 1000) })],
    currentId: "alert-1"
  });
  assert.equal(result.open?.id, "alert-1");
  assert.equal(result.clearCurrent, false);
}

// Stale current overlay is cleared even if status is still active.
{
  const result = recover({
    rows: [activeRow({ created_at: isoAgo(5 * 60 * 60 * 1000) })],
    currentId: "alert-1"
  });
  assert.equal(result.open, null);
  assert.equal(result.clearCurrent, true);
}

// Parent pauses — next poll no longer returns an active row.
{
  const fromEmptyQuery = recover({
    rows: [],
    currentId: "alert-1"
  });
  assert.equal(fromEmptyQuery.open, null);
  assert.equal(fromEmptyQuery.clearCurrent, true);

  const fromPausedRow = recover({
    rows: [activeRow({ status: "paused" })],
    currentId: "alert-1"
  });
  assert.equal(fromPausedRow.open, null);
  assert.equal(fromPausedRow.clearCurrent, true);
}

// Parent fills.
{
  const result = recover({
    rows: [activeRow({ status: "filled" })],
    currentId: "alert-1"
  });
  assert.equal(result.open, null);
  assert.equal(result.clearCurrent, true);
}

// Parent cancels.
{
  const result = recover({
    rows: [activeRow({ status: "cancelled" })],
    currentId: "alert-1"
  });
  assert.equal(result.open, null);
  assert.equal(result.clearCurrent, true);
}

// Different city — never opens.
{
  const result = recover({
    rows: [activeRow({ city: OTHER_CITY, created_at: isoAgo(30 * 1000) })],
    sitterCities: [CITY]
  });
  assert.equal(result.open, null);
  assert.equal(result.clearCurrent, false);
}

// Dismissed stays dismissed for this session.
{
  const result = recover({
    rows: [activeRow({ created_at: isoAgo(2 * 60 * 1000) })],
    dismissedIds: new Set(["alert-1"])
  });
  assert.equal(result.open, null);
  assert.equal(result.clearCurrent, false);
}

// Booking-approval pause hides overlay without treating the row as terminal.
{
  const result = recover({
    rows: [activeRow({ created_at: isoAgo(2 * 60 * 1000) })],
    paused: true,
    currentId: "alert-1"
  });
  assert.equal(result.open, null);
  assert.equal(result.clearCurrent, false);
  assert.equal(isActiveSitterBroadcastStatus("active"), true);
  assert.equal(isTerminalSitterBroadcastStatus("paused"), true);
  assert.equal(isTerminalSitterBroadcastStatus("active"), false);
}

const modal = read("components/sitter/SitterBroadcastAlertModal.tsx");
const host = read("components/sitter/SitterBroadcastAlertHost.tsx");
const dashboard = read("app/sitter/dashboard/page.tsx");
const recovery = read("lib/broadcast/sitter-broadcast-recovery.ts");

assert.match(modal, /recoverActiveSitterBroadcast/);
assert.match(modal, /ACTIVE_SITTER_BROADCAST_RELEVANCE_MS/);
assert.match(modal, /isSitterBroadcastCreatedAtRelevant/);
assert.match(modal, /\.gte\(\s*"created_at"/);
assert.match(host, /useSitterBroadcastPause/);
assert.match(dashboard, /useSitterBroadcastPause\(showSitterBookingApproval\)/);
assert.match(modal, /dismissedAlertIdsRef/);
assert.match(modal, /pausedRef\.current/);

assert.match(recovery, /ACTIVE_SITTER_BROADCAST_RELEVANCE_MS/);
assert.doesNotMatch(recovery, /FRESH_EVENT_MAX_AGE_MS/);
assert.doesNotMatch(recovery, /ALERT_MAX_AGE_MS/);
assert.doesNotMatch(modal, /FRESH_EVENT_MAX_AGE_MS/);
assert.doesNotMatch(modal, /ALERT_MAX_AGE_MS/);
assert.doesNotMatch(modal, /isFreshIso/);
assert.doesNotMatch(modal, /90 \* 1000/);

console.log("sitter broadcast recovery visibility checks passed");
