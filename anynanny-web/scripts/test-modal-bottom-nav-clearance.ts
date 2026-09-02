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
  assert.match(source, /overflow-y-auto/, `${label}: overlay must scroll`);
  assert.match(source, /overscroll-contain/, `${label}: overlay overscroll`);
  assert.match(source, SHELL_INSET, `${label}: AppShell bottom inset`);
  assert.match(source, SHELL_SCROLL_PAD, `${label}: scroll-padding-bottom`);
  assert.match(source, /flex min-h-full justify-center/, `${label}: card stays in overlay flow`);
  assert.match(source, /my-auto/, `${label}: center on tall screens`);
  assert.doesNotMatch(source, /items-end/, `${label}: must not pin to the BottomNav edge`);
  assert.doesNotMatch(
    source,
    /sticky (bottom|top)|fixed bottom/,
    `${label}: no sticky/fixed action bar`
  );
}

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

console.log("modal bottom-nav clearance contract ok");
