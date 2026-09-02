import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  beginCharterSubmit,
  buildCharterAcceptanceRecord,
  canSubmitCharterAcceptance,
  isDuplicateCharterAcceptanceError,
  parseCharterAcceptBody
} from "../lib/charter/acceptance";
import {
  getCharterDocument,
  getCharterPreamble,
  PARENT_CHARTER,
  SITTER_CHARTER
} from "../lib/charter/content";
import {
  charterFullHref,
  nextPathAfterCharterAcceptance,
  nextPathAfterWelcome,
  onboardingPathForRole,
  resolveFlowRole,
  resolvePreOnboardingPath,
  shouldForcePreOnboarding,
  welcomeHref
} from "../lib/charter/routing";
import {
  CURRENT_CHARTER_VERSION,
  PARENT_CHARTER_VERSION,
  SITTER_CHARTER_VERSION
} from "../lib/charter/versions";
import {
  initialWelcomePlaybackState,
  isManualSkipAllowed,
  reduceWelcomePlayback
} from "../lib/welcome/playback";
import { WELCOME_PLAYBACK_TIMEOUT_MS, WELCOME_VIDEO_SRC } from "../lib/welcome/constants";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const parentCharter = getCharterDocument("parent");
const sitterCharter = getCharterDocument("sitter");
const postAuth = read("lib/auth/post-auth-destination.ts");
const acceptanceScreen = read("components/charter/charter-acceptance-screen.tsx");
const welcomePlayer = read("components/welcome/welcome-video-player.tsx");
const welcomeFlow = read("components/welcome/welcome-flow-page.tsx");
const charterFlow = read("components/charter/charter-flow-page.tsx");
const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
const community = read("components/settings/community-resources-section.tsx");
const acceptRoute = read("app/api/charter/accept/route.ts");
const migration = read("supabase/migrations/20260902190000_user_charter_acceptances.sql");
const parentOnboardingPage = read("app/parent/onboarding/page.tsx");
const sitterOnboardingPage = read("app/sitter/onboarding/page.tsx");

// 1–2. Signup destinations: Welcome → role Charter → existing onboarding
assert.equal(welcomeHref("parent"), "/welcome?role=parent");
assert.equal(welcomeHref("sitter"), "/welcome?role=sitter");
assert.equal(nextPathAfterWelcome("parent"), "/charter?role=parent");
assert.equal(nextPathAfterWelcome("sitter"), "/charter?role=sitter");
assert.equal(nextPathAfterCharterAcceptance("parent"), "/parent/onboarding");
assert.equal(nextPathAfterCharterAcceptance("sitter"), "/sitter/onboarding");
assert.equal(onboardingPathForRole("parent"), "/parent/onboarding");
assert.equal(onboardingPathForRole("sitter"), "/sitter/onboarding");
assert.match(postAuth, /destinationBeforeRoleOnboarding|pathBeforeRoleOnboarding/);
assert.match(postAuth, /hasAcceptedCurrentCharter/);
assert.match(postAuth, /welcomeHref\("parent"\)/);
assert.match(postAuth, /welcomeHref\("sitter"\)/);

// 3–4. Role isolation
assert.equal(parentCharter.title, "אמנת ההורה של AnyNanny");
assert.equal(sitterCharter.title, "אמנת הבייביסיטר של AnyNanny");
assert.notEqual(parentCharter.title, sitterCharter.title);
assert.equal(parentCharter.checkboxLabel.includes("הורה"), true);
assert.equal(sitterCharter.checkboxLabel.includes("בייביסיטר"), true);
assert.equal(parentCharter.checkboxLabel.includes("בייביסיטר של AnyNanny"), false);
assert.equal(sitterCharter.checkboxLabel.includes("הורה"), false);
assert.equal(resolveFlowRole("parent", "sitter"), "parent");
assert.equal(resolveFlowRole("sitter", "parent"), "sitter");
assert.match(acceptanceScreen, /getCharterDocument\(role\)/);
assert.match(welcomeFlow, /resolveFlowRole/);
assert.match(charterFlow, /resolveFlowRole/);
assert.doesNotMatch(parentSettings, /role="sitter"/);
assert.doesNotMatch(sitterSettings, /role="parent"/);
assert.match(parentSettings, /CommunityResourcesSection role="parent"/);
assert.match(sitterSettings, /CommunityResourcesSection role="sitter"/);

// 5. Continue CTA disabled until checkbox
assert.match(acceptanceScreen, /canSubmitCharterAcceptance/);
assert.match(acceptanceScreen, /disabled=\{continueDisabled\}/);
assert.equal(canSubmitCharterAcceptance({ checked: false, submitting: false }), false);
assert.equal(canSubmitCharterAcceptance({ checked: true, submitting: false }), true);
assert.equal(canSubmitCharterAcceptance({ checked: true, submitting: true }), false);

// 6. Acceptance persist payload
const record = buildCharterAcceptanceRecord({
  userId: "user-1",
  charterType: "parent",
  acceptedAt: "2026-09-02T00:00:00.000Z"
});
assert.deepEqual(record, {
  user_id: "user-1",
  charter_type: "parent",
  charter_version: PARENT_CHARTER_VERSION,
  accepted_at: "2026-09-02T00:00:00.000Z"
});
assert.equal(CURRENT_CHARTER_VERSION.sitter, SITTER_CHARTER_VERSION);
assert.match(acceptRoute, /auth\.getUser\(\)/);
assert.match(acceptRoute, /persistCharterAcceptance/);
assert.match(acceptRoute, /userId: user\.id/);
assert.deepEqual(parseCharterAcceptBody({ charterType: "sitter" }), { charterType: "sitter" });
assert.equal("error" in parseCharterAcceptBody({ charterType: "admin" }), true);

// 7. Failed persist stays on charter
assert.match(acceptanceScreen, /CHARTER_ACCEPTANCE_ERROR/);
assert.match(acceptanceScreen, /setSubmitting\(false\)/);
assert.match(acceptanceScreen, /if \(!response\.ok\)/);
assert.match(acceptanceScreen, /router\.replace\(nextPathAfterCharterAcceptance\(role\)\)/);
const catchBlock = acceptanceScreen.split("} catch")[1] ?? "";
assert.match(catchBlock, /setError\(CHARTER_ACCEPTANCE_ERROR\)/);
assert.doesNotMatch(catchBlock, /router\.replace/);

// 8. Double-submit guard
assert.equal(beginCharterSubmit({ submitting: true, accepted: false }), null);
assert.deepEqual(beginCharterSubmit({ submitting: false, accepted: false }), {
  submitting: true,
  accepted: false
});
assert.match(acceptanceScreen, /submitLock/);
assert.match(migration, /user_charter_acceptances_user_type_version_uidx/);
assert.equal(isDuplicateCharterAcceptanceError("duplicate key value violates unique constraint"), true);

// 9–11. Video failures continue; no manual skip
const afterError = reduceWelcomePlayback(initialWelcomePlaybackState(), { type: "error" }, "mandatory");
const afterLoadError = reduceWelcomePlayback(initialWelcomePlaybackState(), { type: "error" }, "mandatory");
const afterTimeout = reduceWelcomePlayback(initialWelcomePlaybackState(), { type: "timeout" }, "mandatory");
assert.equal(afterError.shouldContinue, true);
assert.equal(afterLoadError.shouldContinue, true);
assert.equal(afterTimeout.shouldContinue, true);
assert.equal(
  reduceWelcomePlayback(initialWelcomePlaybackState(), { type: "ended" }, "mandatory").shouldContinue,
  true
);
assert.equal(isManualSkipAllowed(), false);
assert.doesNotMatch(welcomePlayer, /Skip|דלג/);
assert.match(welcomePlayer, /onError/);
assert.match(welcomePlayer, /timeout/);
assert.match(welcomePlayer, /autoplay_blocked/);
assert.ok(WELCOME_PLAYBACK_TIMEOUT_MS >= 15_000);

// 12. Existing users are not forced through the flow
assert.equal(shouldForcePreOnboarding({ onboardingComplete: true, charterAccepted: false }), false);
assert.equal(shouldForcePreOnboarding({ onboardingComplete: true, charterAccepted: true }), false);
assert.equal(shouldForcePreOnboarding({ onboardingComplete: false, charterAccepted: false }), true);
assert.equal(shouldForcePreOnboarding({ onboardingComplete: false, charterAccepted: true }), false);
assert.equal(
  resolvePreOnboardingPath({ role: "parent", onboardingComplete: true, charterAccepted: false }),
  "/parent/onboarding"
);
assert.match(welcomeFlow, /onboardingComplete/);
assert.match(welcomeFlow, /\/parent\/dashboard/);
assert.match(charterFlow, /onboardingComplete/);

// 13–15. Personal Area welcome access / replay does not restart onboarding
assert.match(community, /ברוכים הבאים ל-AnyNanny/);
assert.match(community, /welcomeHref\(role, "replay"\)/);
assert.match(parentSettings, /CommunityResourcesSection/);
assert.match(sitterSettings, /CommunityResourcesSection/);
assert.match(welcomeFlow, /mode === "replay"/);
assert.match(welcomeFlow, /חזרה לאזור האישי/);
assert.doesNotMatch(welcomeFlow, /onMandatoryComplete.*replay/);
assert.equal(
  reduceWelcomePlayback(initialWelcomePlaybackState(), { type: "ended" }, "replay").shouldContinue,
  false
);
assert.equal(welcomeHref("parent", "replay"), "/welcome?role=parent&mode=replay");

// 16–17. Full charter later is read-only
assert.match(community, /charterFullHref\(role, settingsPath\)/);
assert.equal(charterFullHref("parent", "/parent/settings").includes("/charter/full"), true);
assert.match(read("app/charter/full/page.tsx"), /CharterFullDocument/);
assert.doesNotMatch(read("app/charter/full/page.tsx"), /charter-acceptance/);
assert.doesNotMatch(read("components/charter/charter-full-document.tsx"), /checkbox|persistCharterAcceptance|\/api\/charter\/accept/);
assert.match(sitterCharter.title, /אמנת הבייביסיטר/);

// 18. Existing onboarding destination unchanged
assert.match(parentOnboardingPage, /ParentOnboardingWizard/);
assert.match(sitterOnboardingPage, /SitterOnboardingWizard/);
assert.doesNotMatch(parentOnboardingPage, /WelcomeVideoPlayer|CharterAcceptanceScreen/);
assert.doesNotMatch(sitterOnboardingPage, /WelcomeVideoPlayer|CharterAcceptanceScreen/);

// Copy + versions + RLS
assert.equal(PARENT_CHARTER.intro.includes("המשפחה"), true);
assert.equal(SITTER_CHARTER.intro.includes("אמון"), true);
assert.ok(getCharterPreamble("parent").some((line) => line.includes("אמון הדדי")));
assert.ok(getCharterPreamble("sitter").some((line) => line.includes("בייביסיטריות למשפחות")));
assert.match(migration, /enable row level security/);
assert.match(migration, /user_id = auth\.uid\(\)/);
assert.match(migration, /grant select, insert/);
assert.doesNotMatch(migration, /for update|for delete|service_role/);

const videoPath = resolve(root, "public/welcome/anynanny-welcome.mp4");
assert.equal(existsSync(videoPath), true, "welcome video asset must exist");
assert.ok(statSync(videoPath).size > 1_000_000, "welcome video should be the supplied ~3MB asset");
assert.equal(WELCOME_VIDEO_SRC, "/welcome/anynanny-welcome.mp4");
assert.match(welcomePlayer, /WELCOME_VIDEO_SRC/);
assert.doesNotMatch(welcomePlayer, /import .*anynanny-welcome/);

console.log("welcome-charter-flow: ok");
