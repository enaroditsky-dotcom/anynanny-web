import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARENT_PRODUCT_TOUR_AUTO_OFFER_AFTER,
  PARENT_TOUR_COPY,
  PARENT_TOUR_INVITE_IMAGE_SRC,
  PARENT_TOUR_KEY,
  PARENT_TOUR_MESSAGES_PATH,
  PARENT_TOUR_SELECTORS,
  USER_PRODUCT_TOURS_TABLE
} from "../lib/product-tour/constants";
import {
  canRestartParentTour,
  hasParentTourChoice,
  isOnboardingCompletedAfterRollout,
  matchesTourRoute,
  shouldAutoOfferParentTour
} from "../lib/product-tour/eligibility";
import { getParentTourStep, PARENT_TOUR_STEPS } from "../lib/product-tour/parent-steps";
import {
  parentTourSessionKey,
  rememberParentTourChoice,
  type ParentTourSessionStore
} from "../lib/product-tour/session-guard";
import { mergeParentTourRows } from "../lib/product-tour/tour-row";
import { firstPresentTourSelector } from "../lib/product-tour/resolve-target";
import { PARENT_SITTER_SEARCH_CTA_LABEL } from "../lib/ui/long-primary-cta";
import {
  clampTourTooltipWidth,
  positionTourTooltip,
  TOUR_TOOLTIP_MAX_WIDTH_PX,
  TOUR_TOOLTIP_MIN_WIDTH_PX,
  tourTooltipOverlapsTarget
} from "../lib/product-tour/tooltip-layout";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260907120000_user_product_tours.sql";
const sql = read(MIGRATION);
const engine = read("components/product-tour/product-tour-engine.tsx");
const provider = read("components/product-tour/parent-tour-provider.tsx");
const modals = read("components/product-tour/parent-tour-modals.tsx");
const settingsEntry = read("components/product-tour/parent-tour-settings-entry.tsx");
const parentLayout = read("app/parent/layout.tsx");
const sitterLayout = read("app/sitter/layout.tsx");
const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const searchFilters = read("components/parent/parent-search-filters.tsx");
const searchPage = read("app/parent/search/page.tsx");
const bottomNav = read("components/bottom-nav.tsx");
const personal = read("components/parent/parent-personal-area.tsx");
const sitterPersonal = read("components/sitter/sitter-personal-area.tsx");
const broadcast = read("app/parent/broadcast/page.tsx");
const persistence = read("lib/product-tour/persistence.ts");
const eligibility = read("lib/product-tour/eligibility.ts");
const inboxUi = read("components/chat/booking-chat-inbox.tsx");
const parentMessages = read("app/parent/messages/page.tsx");
const sitterMessages = read("app/sitter/messages/page.tsx");
const parentChatPage = read("app/parent/chat/[bookingId]/page.tsx");
const sitterChatPage = read("app/sitter/chat/[bookingId]/page.tsx");
const whatsappAction = read("components/chat/whatsapp-handoff-action.tsx");

const NEW_PARENT = "2026-09-07T12:00:00.000Z";
const EXISTING_PARENT = "2026-08-01T00:00:00.000Z";

function offerInput(overrides: Partial<Parameters<typeof shouldAutoOfferParentTour>[0]> = {}) {
  return {
    authenticated: true,
    role: "parent" as const,
    pathname: "/parent/dashboard",
    parentOnboardingCompletedAt: NEW_PARENT,
    tour: null,
    ...overrides
  };
}

function tourRow(
  overrides: Partial<{
    offered_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    declined_at: string | null;
    skipped_at: string | null;
  }> = {}
) {
  return {
    user_id: "u",
    tour_key: "parent" as const,
    offered_at: null,
    started_at: null,
    completed_at: null,
    declined_at: null,
    skipped_at: null,
    ...overrides
  };
}

function memoryStore(): ParentTourSessionStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
}

// 1. parent with completed onboarding sees invitation once
assert.equal(shouldAutoOfferParentTour(offerInput()), true);
assert.equal(
  shouldAutoOfferParentTour(
    offerInput({ tour: tourRow({ offered_at: NEW_PARENT }) })
  ),
  false
);
assert.match(provider, /phase === "invite"/);
assert.match(modals, /PARENT_TOUR_COPY\.inviteTitle/);
assert.equal(PARENT_TOUR_COPY.inviteTitle, "בואו להכיר את AnyNanny!");
assert.equal(PARENT_TOUR_INVITE_IMAGE_SRC, "https://www.anynanny.org/images/onboarding/welcome-anynanny-tour.png");
assert.equal(
  PARENT_TOUR_COPY.inviteBody,
  "הכנו לכם סיור קצר שיעבור איתכם על הדברים החשובים באפליקציה — חיפוש בייביסיטר, AnyNanny NOW!, הודעות, אזור אישי ועוד."
);

// 2. כן, תראו לי starts the tour
assert.equal(PARENT_TOUR_COPY.invitePrimary, "כן, תראו לי");
assert.match(provider, /onAccept=\{startTour\}/);
assert.match(provider, /setPhase\("touring"\)/);
assert.match(persistence, /markParentTourStarted/);

// 3. לא עכשיו shows the settings reminder
assert.equal(PARENT_TOUR_COPY.inviteSecondary, "לא עכשיו");
assert.equal(PARENT_TOUR_COPY.declinedBody, "תוכלו לראות את ההדרכה בכל רגע דרך ⚙️ הגדרות.");
assert.equal(PARENT_TOUR_COPY.declinedConfirm, "הבנתי");
assert.match(provider, /onDecline=\{declineTour\}/);
assert.match(provider, /phase === "declined-ack"/);

// 4. invitation does not auto-show again after decline
assert.equal(shouldAutoOfferParentTour(offerInput({ tour: tourRow({ declined_at: NEW_PARENT }) })), false);
assert.equal(shouldAutoOfferParentTour(offerInput({ tour: tourRow({ skipped_at: NEW_PARENT }) })), false);
assert.equal(shouldAutoOfferParentTour(offerInput({ tour: tourRow({ started_at: NEW_PARENT }) })), false);
assert.equal(hasParentTourChoice(tourRow({ started_at: NEW_PARENT })), true);
assert.equal(hasParentTourChoice(tourRow({ skipped_at: NEW_PARENT })), true);
assert.equal(hasParentTourChoice(tourRow()), false);

const sessionStore = memoryStore();
const remembered = rememberParentTourChoice("u", null, { declined_at: NEW_PARENT }, sessionStore);
assert.equal(hasParentTourChoice(remembered), true);
assert.equal(
  shouldAutoOfferParentTour(offerInput({ tour: null, sessionTour: remembered })),
  false
);
assert.equal(
  shouldAutoOfferParentTour(
    offerInput({
      tour: null,
      sessionTour: rememberParentTourChoice("u", null, { completed_at: NEW_PARENT }, memoryStore())
    })
  ),
  false
);
assert.equal(
  shouldAutoOfferParentTour(
    offerInput({
      tour: null,
      sessionTour: rememberParentTourChoice("u", null, { offered_at: NEW_PARENT }, memoryStore())
    })
  ),
  false
);
assert.match(parentTourSessionKey("u"), /anynanny_parent_tour_choice:u/);
assert.equal(
  hasParentTourChoice(mergeParentTourRows(null, tourRow({ declined_at: NEW_PARENT }))),
  true
);
assert.match(provider, /rememberParentTourChoice/);
assert.match(provider, /readParentTourSession/);
assert.match(provider, /mergeParentTourRows/);
assert.match(provider, /console\.warn/);
assert.match(persistence, /user_product_tours is unavailable/);
assert.match(provider, /setTourRow\(\(prev\) => rememberParentTourChoice/);
assert.match(provider, /setTourRow\(\(prev\) => mergeParentTourRows\(prev, sessionRow, row\)\)/);
assert.doesNotMatch(provider, /offeredOnce/);
const restartBlock = provider.slice(provider.indexOf("const restartParentTour"));
assert.match(restartBlock, /setPhase\("touring"\)/);
assert.doesNotMatch(restartBlock.slice(0, 500), /shouldAutoOfferParentTour/);
assert.equal(canRestartParentTour({ authenticated: true, role: "parent" }), true);
assert.equal(
  shouldAutoOfferParentTour(offerInput({ tour: tourRow({ completed_at: NEW_PARENT }) })),
  false
);
assert.equal(
  shouldAutoOfferParentTour(offerInput({ tour: tourRow({ declined_at: NEW_PARENT }) })),
  false
);

// 5. completed tour does not auto-show again
assert.equal(
  shouldAutoOfferParentTour(
    offerInput({
      tour: {
        user_id: "u",
        tour_key: "parent",
        offered_at: NEW_PARENT,
        started_at: NEW_PARENT,
        completed_at: NEW_PARENT,
        declined_at: null,
        skipped_at: null
      }
    })
  ),
  false
);
assert.equal(hasParentTourChoice({
  user_id: "u",
  tour_key: "parent",
  offered_at: null,
  started_at: null,
  completed_at: NEW_PARENT,
  declined_at: null,
  skipped_at: null
}), true);

// 6. Settings can restart the tour
assert.equal(PARENT_TOUR_COPY.settingsTitle, "מדריך שימוש באפליקציה");
assert.equal(PARENT_TOUR_COPY.settingsSubtitle, "הפעילו מחדש את הסיור הקצר של AnyNanny.");
assert.match(parentSettings, /ParentTourSettingsEntry/);
assert.match(settingsEntry, /restartParentTour/);
assert.match(provider, /PARENT_TOUR_DASHBOARD_PATH/);
assert.equal(canRestartParentTour({ authenticated: true, role: "parent" }), true);
assert.equal(canRestartParentTour({ authenticated: true, role: "sitter" }), false);

// 7. search step targets the real search button
const searchStep = PARENT_TOUR_STEPS.find((step) => step.id === "parent-search");
assert.ok(searchStep);
assert.equal(searchStep?.targetSelector, PARENT_TOUR_SELECTORS.search);
assert.equal(searchStep?.advanceMode, "click-target");
assert.match(dashboard, /data-tour="parent-search"/);
assert.match(dashboard, /href="\/parent\/search"/);
assert.match(dashboard, /PARENT_SITTER_SEARCH_CTA_LABEL/);
assert.equal(PARENT_SITTER_SEARCH_CTA_LABEL, "חיפוש בייביסיטר");

// 8. verified-only step targets the existing verified control
const verifiedStep = PARENT_TOUR_STEPS.find((step) => step.id === "verified-only");
assert.ok(verifiedStep);
assert.equal(verifiedStep?.targetSelector, PARENT_TOUR_SELECTORS.verifiedOnly);
assert.equal(verifiedStep?.preserveTargetState, true);
assert.match(searchFilters, /data-tour="verified-only"/);
assert.match(searchFilters, /PARENT_SEARCH_VERIFIED_ONLY_LABEL/);
assert.match(engine, /preserveTargetState/);

// 9. AnyNanny NOW navigation works without sending a real request
const nowStep = PARENT_TOUR_STEPS.find((step) => step.id === "anynanny-now");
const nowExplain = PARENT_TOUR_STEPS.find((step) => step.id === "anynanny-now-explain");
assert.equal(nowStep?.advanceMode, "click-target");
assert.equal(nowExplain?.advanceMode, "next-button");
assert.match(bottomNav, /data-tour="anynanny-now"/);
assert.match(bottomNav, /href="\/parent\/broadcast"/);
assert.match(broadcast, /data-tour="anynanny-now-explain"/);
assert.doesNotMatch(engine, /broadcast_alerts|handleStartBroadcast/);
assert.doesNotMatch(provider, /broadcast_alerts|handleStartBroadcast/);
assert.match(broadcast, /handleStartBroadcast/);

// 10. Messages nav still targets the real Messages item and opens the short sequence
const messagesStep = PARENT_TOUR_STEPS.find((step) => step.id === "messages");
assert.equal(messagesStep?.targetSelector, PARENT_TOUR_SELECTORS.messages);
assert.equal(messagesStep?.advanceMode, "click-target");
assert.equal(messagesStep?.title, "הודעות");
assert.equal(messagesStep?.description, "כאן תמצאו את השיחות שקשורות למשמרות שלכם.");
assert.match(bottomNav, /tour: "messages"/);
assert.match(bottomNav, /href: "\/parent\/messages"/);

const messagesIndex = PARENT_TOUR_STEPS.findIndex((step) => step.id === "messages");
assert.equal(PARENT_TOUR_STEPS[messagesIndex + 1]?.id, "messages-chat");
assert.equal(PARENT_TOUR_STEPS[messagesIndex + 2]?.id, "messages-whatsapp");
assert.equal(PARENT_TOUR_STEPS[messagesIndex + 3]?.id, "messages-after-shift");
assert.equal(PARENT_TOUR_STEPS[messagesIndex + 4]?.id, "personal-area");

const chatExplain = PARENT_TOUR_STEPS.find((step) => step.id === "messages-chat");
assert.ok(chatExplain);
assert.equal(chatExplain?.route, PARENT_TOUR_MESSAGES_PATH);
assert.equal(chatExplain?.targetSelector, PARENT_TOUR_SELECTORS.messagesChat);
assert.equal(chatExplain?.advanceMode, "next-button");
assert.equal(chatExplain?.title, "הצ׳אט בתוך AnyNanny");
assert.equal(chatExplain?.description, "הצ׳אט נפתח כבר מרגע שנשלחה בקשה למשמרת.");
assert.match(inboxUi, /tourAnchor="messages-chat"/);
assert.match(parentMessages, /ParentBookingChatInbox/);
assert.match(parentChatPage, /data-tour="messages-chat"/);

const whatsappStep = PARENT_TOUR_STEPS.find((step) => step.id === "messages-whatsapp");
assert.ok(whatsappStep);
assert.equal(whatsappStep?.advanceMode, "next-button");
assert.equal(whatsappStep?.targetSelector, PARENT_TOUR_SELECTORS.whatsappHandoff);
assert.equal(whatsappStep?.fallbackSelector, PARENT_TOUR_SELECTORS.messagesChat);
assert.equal(whatsappStep?.blockTargetAction, true);
assert.match(whatsappAction, /data-tour="whatsapp-handoff"/);
assert.equal(
  firstPresentTourSelector(
    [PARENT_TOUR_SELECTORS.whatsappHandoff, PARENT_TOUR_SELECTORS.messagesChat],
    (selector) => selector === PARENT_TOUR_SELECTORS.messagesChat
  ),
  PARENT_TOUR_SELECTORS.messagesChat
);
assert.equal(
  firstPresentTourSelector(
    [PARENT_TOUR_SELECTORS.whatsappHandoff, PARENT_TOUR_SELECTORS.messagesChat],
    () => false
  ),
  null
);
assert.match(engine, /tourStepSelectorList|firstPresentTourSelector/);
assert.match(engine, /blockTargetAction/);
assert.doesNotMatch(engine, /\/api\/chat\/whatsapp/);
assert.doesNotMatch(engine, /wa\.me/);
assert.doesNotMatch(provider, /\/api\/chat\/whatsapp|wa\.me|openWhatsAppHandoffUrl/);
assert.doesNotMatch(engine, /advanceMode === "click-target".*whatsapp-handoff/s);

const afterShift = PARENT_TOUR_STEPS.find((step) => step.id === "messages-after-shift");
assert.equal(afterShift?.advanceMode, "next-button");
assert.equal(afterShift?.title, "אחרי המשמרת");
assert.equal(afterShift?.description, "אחרי סיום המשמרת, השיחה נשארת לקריאה ואפשר לכתוב בצ׳אט עוד 24 שעות.");
assert.equal(afterShift?.targetSelector, PARENT_TOUR_SELECTORS.messagesChat);

// 11. Personal Area step advances correctly
const personalStep = PARENT_TOUR_STEPS.find((step) => step.id === "personal-area");
assert.equal(personalStep?.targetSelector, PARENT_TOUR_SELECTORS.personalArea);
assert.equal(personalStep?.advanceMode, "click-target");
assert.match(bottomNav, /tour: "personal-area"/);
assert.match(personal, /data-tour="identity-verification"/);
assert.match(personal, /IdentityPersonalSection role="parent"/);

// 12. Settings step advances correctly
const settingsStep = PARENT_TOUR_STEPS.find((step) => step.id === "settings");
assert.equal(settingsStep?.targetSelector, PARENT_TOUR_SELECTORS.settings);
assert.equal(settingsStep?.advanceMode, "click-target");
assert.match(bottomNav, /tour: "settings"/);

// 13. skip works
assert.equal(PARENT_TOUR_COPY.skip, "דלג על הסיור");
assert.match(engine, /PARENT_TOUR_COPY\.skip/);
assert.match(provider, /onSkip=\{skipTour\}/);
assert.match(persistence, /markParentTourSkipped/);

// 14. missing target fails gracefully
assert.match(engine, /PARENT_TOUR_COPY\.missingTarget/);
assert.match(engine, /showNext = step\.advanceMode === "next-button" \|\| missing/);
assert.equal(getParentTourStep(99), null);
assert.doesNotMatch(engine, /throw new Error/);

// 15. existing parent workflows still work normally
assert.match(dashboard, /ParentOnboardingWizard/);
assert.match(searchPage, /ParentSearchFiltersBar/);
assert.match(searchPage, /handleSearch/);
assert.match(searchFilters, /verifiedOnly: e\.target\.checked/);
assert.match(broadcast, /from\("broadcast_alerts"\)/);
assert.match(parentSettings, /NotificationSettingsSection/);
assert.match(parentSettings, /DeleteAccountSection/);

// 16. sitter users are unaffected
assert.doesNotMatch(sitterLayout, /ParentTourProvider/);
assert.doesNotMatch(sitterSettings, /ParentTourSettingsEntry|מדריך שימוש באפליקציה/);
assert.doesNotMatch(sitterPersonal, /data-tour="identity-verification"/);
assert.equal(shouldAutoOfferParentTour(offerInput({ role: "sitter" })), false);
assert.doesNotMatch(read("lib/product-tour/parent-steps.ts"), /sitter-home|sitter-tour/);
assert.doesNotMatch(sitterMessages, /data-tour="messages-chat"|tourAnchor="messages-chat"/);
assert.doesNotMatch(sitterChatPage, /data-tour="messages-chat"/);
assert.doesNotMatch(
  inboxUi.slice(inboxUi.indexOf("export function SitterBookingChatInbox")),
  /tourAnchor/
);

// Compact tooltip stays mobile-safe and off the highlighted target
assert.equal(TOUR_TOOLTIP_MAX_WIDTH_PX, 320);
assert.equal(TOUR_TOOLTIP_MIN_WIDTH_PX, 280);
assert.equal(clampTourTooltipWidth(400, 390), 320);
assert.equal(clampTourTooltipWidth(300, 390), 300);
assert.equal(clampTourTooltipWidth(300, 320), 296);
assert.ok(clampTourTooltipWidth(300, 360) >= 280);
assert.ok(clampTourTooltipWidth(300, 360) <= 320);
assert.match(engine, /max-w-\[320px\]/);
assert.match(engine, /w-\[min\(20rem,calc\(100vw-1\.5rem\)\)\]/);
assert.doesNotMatch(engine, /w-\[min\(22rem/);
assert.doesNotMatch(engine, /max-h-\[40vh\]/);
assert.match(engine, /scrollIntoView/);
assert.match(engine, /PARENT_TOUR_COPY\.next/);
assert.match(engine, /PARENT_TOUR_COPY\.skip/);

const navTarget = { top: 760, left: 80, width: 80, height: 64 };
const aboveNav = positionTourTooltip(navTarget, "top", 300, 120, { width: 390, height: 844 });
assert.ok(aboveNav.top + 120 <= navTarget.top);
assert.equal(
  tourTooltipOverlapsTarget({ top: aboveNav.top, left: aboveNav.left, width: 300, height: 120 }, navTarget),
  false
);
const headerTarget = { top: 24, left: 16, width: 358, height: 72 };
const belowHeader = positionTourTooltip(headerTarget, "bottom", 300, 120, { width: 390, height: 844 });
assert.ok(belowHeader.top >= headerTarget.top + headerTarget.height);
assert.equal(
  tourTooltipOverlapsTarget(
    { top: belowHeader.top, left: belowHeader.left, width: 300, height: 120 },
    headerTarget
  ),
  false
);

// 17. Android/TWA/Google Play files are untouched
const tourSources = [
  engine,
  provider,
  modals,
  settingsEntry,
  persistence,
  eligibility,
  sql,
  parentLayout,
  parentSettings
].join("\n");
assert.doesNotMatch(tourSources, /android\/|twa|assetlinks|google play|Play Console|\.aab/i);
const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: root,
  encoding: "utf8"
}).trim();
const gitFiles = execFileSync("git", ["status", "--porcelain", "--", "android", "twa"], {
  cwd: gitRoot,
  encoding: "utf8"
}).trim();
assert.equal(gitFiles, "", `Android/TWA files must be untouched, got:\n${gitFiles}`);
assert.equal(existsSync(resolve(gitRoot, "android/app/build.gradle.kts")), true);

// Rollout: existing parents are not auto-offered
assert.equal(isOnboardingCompletedAfterRollout(EXISTING_PARENT), false);
assert.equal(isOnboardingCompletedAfterRollout(NEW_PARENT), true);
assert.equal(
  shouldAutoOfferParentTour(offerInput({ parentOnboardingCompletedAt: EXISTING_PARENT })),
  false
);
assert.equal(shouldAutoOfferParentTour(offerInput({ authenticated: false })), false);
assert.equal(shouldAutoOfferParentTour(offerInput({ pathname: "/parent/onboarding" })), false);
assert.equal(PARENT_PRODUCT_TOUR_AUTO_OFFER_AFTER, "2026-09-07T00:00:00.000Z");

// Persistence / RLS
assert.match(sql, /create table if not exists public\.user_product_tours/);
assert.match(sql, /tour_key = 'parent'/);
assert.match(sql, /enable row level security/);
assert.match(sql, /user_id = auth\.uid\(\)/);
assert.match(sql, /grant select, insert, update/);
assert.doesNotMatch(sql, /grant delete/);
assert.doesNotMatch(sql, /service_role/);
assert.doesNotMatch(sql, /identity_id_number|child_special_or_medical/);
assert.equal(USER_PRODUCT_TOURS_TABLE, "user_product_tours");
assert.equal(PARENT_TOUR_KEY, "parent");
assert.match(persistence, /upsertParentProductTour/);

// Route handling
assert.equal(matchesTourRoute("/parent/search", "/parent/search", true), true);
assert.equal(matchesTourRoute("/parent/search/results", "/parent/search", true), false);
assert.equal(matchesTourRoute("/parent/broadcast", "/parent"), true);
assert.match(engine, /matchesTourRoute/);

// Copy + completion
assert.equal(PARENT_TOUR_COPY.completionTitle, "זהו, אתם מוכנים 😊");
assert.equal(PARENT_TOUR_COPY.next, "הבא");
assert.match(provider, /phase === "complete"/);
assert.match(modals, /completionPrimary/);
assert.equal(PARENT_TOUR_STEPS.map((step) => step.id).join(","), [
  "parent-home",
  "parent-search",
  "parent-search-filters",
  "verified-only",
  "anynanny-now",
  "anynanny-now-explain",
  "messages",
  "messages-chat",
  "messages-whatsapp",
  "messages-after-shift",
  "personal-area",
  "identity-verification",
  "settings"
].join(","));

assert.match(dashboard, /data-tour="parent-home"/);
assert.match(searchFilters, /data-tour="parent-search-filters"/);
assert.match(parentLayout, /<ParentTourProvider>/);
assert.match(parentLayout, /<ProductPortalGate portal="parent">\{children\}<\/ProductPortalGate>/);
const providerIdx = parentLayout.indexOf("<ParentTourProvider>");
const gateIdx = parentLayout.indexOf("<ProductPortalGate");
assert.ok(providerIdx >= 0 && gateIdx > providerIdx, "tour provider must wrap ProductPortalGate so route changes do not reset the tour");
assert.match(modals, /AUTH_MODAL_OVERLAY_SCROLL/);
assert.match(modals, /AUTH_MODAL_CENTER_WRAP/);
assert.match(modals, /my-auto/);
assert.doesNotMatch(modals, /items-end/);
assert.doesNotMatch(modals, /sticky bottom|fixed bottom/);
assert.match(engine, /dir="rtl"/);
assert.match(engine, /prefers-reduced-motion/);
assert.match(engine, /focus-visible:ring-2/);
assert.match(engine, /Escape/);
assert.doesNotMatch(provider, /new Audio|speechSynthesis|play\(\)/);
assert.doesNotMatch(engine, /new Audio|speechSynthesis/);

const androidDir = resolve(gitRoot, "android");
assert.equal(readdirSync(androidDir).includes("app"), true);

console.log("parent-product-tour: ok");
