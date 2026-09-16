import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const sitterLayout = read("app/sitter/layout.tsx");
const parentLayout = read("app/parent/layout.tsx");
const host = read("components/sitter/SitterBroadcastAlertHost.tsx");
const modal = read("components/sitter/SitterBroadcastAlertModal.tsx");
const dashboard = read("app/sitter/dashboard/page.tsx");
const appShell = read("components/app-shell-gate.tsx");

// One sitter-global host lives in the authenticated sitter layout.
assert.match(sitterLayout, /SitterBroadcastAlertHost/);
assert.match(sitterLayout, /SessionRoleBoundary role="sitter"/);
assert.match(
  sitterLayout,
  /SitterBroadcastAlertHost[\s\S]*ProductPortalGate portal="sitter"/
);

// Parent / public shells must never mount the sitter Broadcast listener.
assert.doesNotMatch(parentLayout, /SitterBroadcastAlert/);
assert.doesNotMatch(appShell, /SitterBroadcastAlert/);

// Dashboard no longer owns the listener or a second modal instance.
assert.doesNotMatch(dashboard, /SitterBroadcastAlertModal/);
assert.match(dashboard, /useSitterBroadcastPause/);
assert.match(dashboard, /useSitterBroadcastPause\(showSitterBookingApproval\)/);

// Host: one listener, auth-gated, no per-page duplication.
assert.match(host, /useAuth/);
assert.match(host, /from "@\/components\/sitter\/SitterBroadcastAlertModal"/);
assert.match(host, /<SitterBroadcastAlertModal sitterId=\{sitterId\} paused=\{paused\} \/>/);
assert.match(host, /if \(isLoading \|\| !sitterId\)/);
assert.equal((host.match(/<SitterBroadcastAlertModal /g) ?? []).length, 1);

// Existing eligibility / dedupe / lifecycle must stay in the shared modal.
assert.match(modal, /anynanny_broadcast_dismissed_v1/);
assert.match(modal, /dismissedAlertIdsRef/);
assert.match(modal, /tryOpenAlert/);
assert.match(modal, /previous\?\.id === alert\.id/);
assert.match(modal, /subscribePostgresChanges/);
assert.match(modal, /removeRealtimeChannel/);
assert.match(modal, /התעלם \/ לא רלוונטי/);
assert.match(modal, /קריאת ברק מיידית בסביבה!/);
assert.match(modal, /createPortal/);
assert.match(modal, /document\.body/);
assert.match(modal, /z-\[9999\]/);
assert.match(modal, /recoverActiveSitterBroadcast/);
assert.match(modal, /ACTIVE_SITTER_BROADCAST_RELEVANCE_MS/);
assert.match(modal, /isSitterBroadcastCreatedAtRelevant/);
assert.match(modal, /\.eq\(\s*"status",\s*"active"/);
assert.match(modal, /\.gte\(\s*"created_at"/);

// Visibility follows DB status plus a NOW relevance window. Do not restore
// the old 90s poll-only gate that blocked offline recovery.
assert.doesNotMatch(modal, /FRESH_EVENT_MAX_AGE_MS/);
assert.doesNotMatch(modal, /ALERT_MAX_AGE_MS/);
assert.doesNotMatch(modal, /isFreshIso/);
assert.doesNotMatch(modal, /90 \* 1000/);
assert.doesNotMatch(modal, /10 \* 60 \* 1000/);
assert.doesNotMatch(
  modal,
  /eligible for recovery for up to 10 minutes/
);
assert.doesNotMatch(
  modal,
  /Poll recovery should only open a recent broadcast/
);

console.log("sitter broadcast global host checks passed");
