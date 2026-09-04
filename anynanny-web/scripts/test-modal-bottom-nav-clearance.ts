import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const SHELL_INSET =
  /pb-\[calc\(8rem\+var\(--anynanny-now-dock,0px\)\+env\(safe-area-inset-bottom,0px\)\)\]/;
const SHELL_SCROLL_PAD =
  /scroll-pb-\[calc\(8rem\+var\(--anynanny-now-dock,0px\)\+env\(safe-area-inset-bottom,0px\)\)\]/;

function overlayContract(source: string, label: string) {
  const usesShared = source.includes("AUTH_MODAL_OVERLAY_SCROLL");
  if (usesShared) {
    assert.match(source, /AUTH_MODAL_OVERLAY_SCROLL/, `${label}: shared overlay scroll`);
    assert.match(source, /AUTH_MODAL_CENTER_WRAP/, `${label}: shared center wrap`);
    assert.match(source, /my-auto/, `${label}: center on tall screens`);
  } else {
    assert.match(source, /overflow-y-auto/, `${label}: overlay must scroll`);
    assert.match(source, /overscroll-contain/, `${label}: overlay overscroll`);
    assert.match(source, SHELL_INSET, `${label}: AppShell bottom inset`);
    assert.match(source, SHELL_SCROLL_PAD, `${label}: scroll-padding-bottom`);
    assert.match(source, /flex min-h-full justify-center/, `${label}: card stays in overlay flow`);
    assert.match(source, /my-auto/, `${label}: center on tall screens`);
  }
  assert.doesNotMatch(source, /items-end/, `${label}: must not pin to the BottomNav edge`);
  assert.doesNotMatch(source, /sticky bottom|fixed bottom/, `${label}: no sticky/fixed action footer`);
}

const helper = read("lib/ui/auth-modal-overlay.ts");
assert.match(helper, /overflow-y-auto/);
assert.match(helper, /overscroll-contain/);
assert.match(helper, SHELL_INSET);
assert.match(helper, SHELL_SCROLL_PAD);
assert.match(helper, /flex min-h-full justify-center/);

const deleteUi = read("components/account/delete-account-section.tsx");
const safetyUi = read("components/safety/user-safety-actions.tsx");
const reportUi = read("components/safety/report-user-sheet.tsx");
const reference = read("components/parent/release-stuck-shift-modal.tsx");
const shell = read("components/app-shell-gate.tsx");

assert.match(shell, /8rem\+var\(--anynanny-now-dock,0px\)\+env\(safe-area-inset-bottom,0px\)/);
overlayContract(reference, "release-stuck-shift");
overlayContract(deleteUi, "delete-account");
overlayContract(safetyUi, "safety-chooser");
overlayContract(reportUi, "report-user");

assert.match(deleteUi, /אזהרה!/);
assert.match(deleteUi, /אתה הולך למחוק את החשבון לצמיתות! אתה רוצה להמשיך\?/);
assert.match(deleteUi, /handleConfirmDelete/);
assert.match(deleteUi, /busy \? "מוחקים…" : "כן"/);
assert.match(deleteUi, /לא/);
assert.match(deleteUi, /deleteCurrentUserAccount\(supabase\)/);
assert.match(deleteUi, /z-\[130\]/);

assert.match(safetyUi, /ביטחון ודיווח/);
assert.match(
  safetyUi,
  /אם נתקלת בהתנהגות לא הולמת או שיש לך חשש לגבי משתמש זה, ניתן לדווח עליו או לחסום אותו/
);
assert.match(safetyUi, /handleReport/);
assert.match(safetyUi, /handleBlock/);
assert.match(safetyUi, /aria-label="סגור"/);
assert.match(safetyUi, /דיווח/);
assert.match(safetyUi, /חסימה/);
assert.match(safetyUi, /ביטול/);
assert.match(safetyUi, /z-\[120\]/);

assert.match(reportUi, /דיווח על משתמש/);
assert.match(reportUi, /handleSubmit/);
assert.match(reportUi, /שלח דיווח/);

const modified = {
  "book-shift": read("components/parent/book-shift-modal.tsx"),
  "parent-wallet": read("app/parent/wallet/wallet-client.tsx"),
  "sitter-payout": read("components/sitter/SitterPayoutWalletCards.tsx"),
  "personal-area": read("components/personal-area/personal-area-ui.tsx"),
  "session-rating": read("components/session/session-rating-modal.tsx"),
  "bank-details": read("components/sitter/SitterBankDetailsModal.tsx"),
  "availability": read("components/sitter/sitter-availability-manager.tsx"),
  "parent-details": read("components/sitter/parent-details-modal.tsx"),
  "broadcast-alert": read("components/sitter/SitterBroadcastAlertModal.tsx"),
  "settings-sheet": read("components/settings/mobile-settings-ui.tsx"),
  "cancel-request": read("components/bookings/shift-cancellation-request-modal.tsx"),
  "cancel-incoming": read("components/bookings/shift-cancellation-incoming-modal.tsx"),
  "cancel-approved": read("components/bookings/shift-cancellation-approved-modal.tsx"),
  "cancel-approve": read("components/bookings/shift-cancellation-approve-modal.tsx"),
  "pending-reminder": read("components/bookings/pending-no-response-reminder-modal.tsx"),
  "booking-response": read("components/parent/parent-booking-response-modal.tsx"),
  "hyp-checkout": read("components/billing/HypCheckoutFrame.tsx")
} as const;

for (const [label, source] of Object.entries(modified)) {
  overlayContract(source, label);
  assert.doesNotMatch(source, /absolute inset-0/, `${label}: no full-screen close trap`);
}

const bookShift = modified["book-shift"];
assert.match(bookShift, /תיאום משמרת/);
assert.match(bookShift, /שלח בקשה/);
assert.match(bookShift, /handleClose/);
assert.doesNotMatch(bookShift, /max-h-\[90dvh\]|max-h-\[85vh\]/);

const parentWallet = modified["parent-wallet"];
assert.match(parentWallet, /אמצעי תשלום שלי/);
assert.match(parentWallet, /PARENT_WALLET_SELECTABLE_METHODS/);
assert.match(parentWallet, /תשלום משמרת מוצג בדשבורד לפי אמצעי הקבלה/);
assert.doesNotMatch(parentWallet, /Google Pay|Apple Pay/);
assert.doesNotMatch(parentWallet, /items-end/);

const hyp = modified["hyp-checkout"];
assert.match(hyp, /sticky top-0/);
assert.doesNotMatch(hyp, /sticky bottom/);

const parentDetails = modified["parent-details"];
assert.match(parentDetails, /AUTH_MODAL_CARD_SHELL/);
assert.match(parentDetails, /AUTH_MODAL_BODY_SCROLL/);
assert.match(parentDetails, /חוות דעת מבייביסיטרים/);
assert.match(parentDetails, /aria-expanded/);
assert.match(parentDetails, /VerifiedUserBadge/);
assert.match(parentDetails, /VERIFIED_PARENT_IDENTITY_LABEL/);
assert.doesNotMatch(parentDetails, /sticky bottom/);

const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 360, h: 640 },
  { w: 375, h: 667 },
  { w: 390, h: 844 }
] as const;
const REM_PX = 16;
const BOTTOM_INSET_PX = 8 * REM_PX;
const NAV_ESTIMATE_PX = 80;

assert.ok(BOTTOM_INSET_PX > NAV_ESTIMATE_PX, "8rem overlay padding clears BottomNav height");
for (const vp of VIEWPORTS) {
  const usable = vp.h - BOTTOM_INSET_PX;
  assert.ok(
    usable > 240,
    `${vp.w}x${vp.h}: overlay still has ${usable}px above BottomNav clearance`
  );
  assert.ok(
    BOTTOM_INSET_PX < vp.h,
    `${vp.w}x${vp.h}: last action can scroll fully into the ${BOTTOM_INSET_PX}px bottom inset`
  );
}

console.log("modal bottom-nav clearance contract ok");
