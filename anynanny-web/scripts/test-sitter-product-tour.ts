import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARENT_TOUR_COPY,
  PARENT_TOUR_KEY,
  SITTER_PRODUCT_TOUR_AUTO_OFFER_AFTER,
  SITTER_TOUR_COPY,
  SITTER_TOUR_DASHBOARD_PATH,
  SITTER_TOUR_KEY,
  SITTER_TOUR_PROFILE_PATH,
  SITTER_TOUR_SCHEDULE_PATH,
  SITTER_TOUR_SELECTORS,
  USER_PRODUCT_TOURS_TABLE
} from "../lib/product-tour/constants";
import {
  canRestartParentTour,
  canRestartSitterTour,
  hasProductTourChoice,
  isOnboardingCompletedAfterRollout,
  matchesTourRoute,
  shouldAutoOfferParentTour,
  shouldAutoOfferSitterTour
} from "../lib/product-tour/eligibility";
import { PARENT_TOUR_STEPS } from "../lib/product-tour/parent-steps";
import { getSitterTourStep, SITTER_TOUR_STEPS } from "../lib/product-tour/sitter-steps";
import {
  rememberSitterTourChoice,
  sitterTourSessionKey,
  type SitterTourSessionStore
} from "../lib/product-tour/session-guard";
import { mergeProductTourRows } from "../lib/product-tour/tour-row";
import { firstPresentTourSelector } from "../lib/product-tour/resolve-target";
import {
  clampTourTooltipWidth,
  TOUR_TOOLTIP_MAX_WIDTH_PX,
  TOUR_TOOLTIP_MIN_WIDTH_PX
} from "../lib/product-tour/tooltip-layout";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const PARENT_MIGRATION = "supabase/migrations/20260907120000_user_product_tours.sql";
const SITTER_MIGRATION = "supabase/migrations/20260907223000_user_product_tours_sitter.sql";
const engine = read("components/product-tour/product-tour-engine.tsx");
const parentProvider = read("components/product-tour/parent-tour-provider.tsx");
const parentSteps = read("lib/product-tour/parent-steps.ts");
const parentModals = read("components/product-tour/parent-tour-modals.tsx");
const provider = read("components/product-tour/sitter-tour-provider.tsx");
const modals = read("components/product-tour/sitter-tour-modals.tsx");
const settingsEntry = read("components/product-tour/sitter-tour-settings-entry.tsx");
const parentLayout = read("app/parent/layout.tsx");
const sitterLayout = read("app/sitter/layout.tsx");
const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");
const dashboard = read("app/sitter/dashboard/page.tsx");
const availability = read("components/sitter/sitter-availability-manager.tsx");
const shiftsPage = read("app/sitter/shifts/page.tsx");
const bottomNav = read("components/bottom-nav.tsx");
const personal = read("components/sitter/sitter-personal-area.tsx");
const parentPersonal = read("components/parent/parent-personal-area.tsx");
const paymentSection = read("components/sitter/SitterManualReceivingDestinationsSection.tsx");
const walletPage = read("app/sitter/wallet/page.tsx");
const persistence = read("lib/product-tour/persistence.ts");
const eligibility = read("lib/product-tour/eligibility.ts");
const inboxUi = read("components/chat/booking-chat-inbox.tsx");
const sitterChatPage = read("app/sitter/chat/[bookingId]/page.tsx");
const parentChatPage = read("app/parent/chat/[bookingId]/page.tsx");
const whatsappAction = read("components/chat/whatsapp-handoff-action.tsx");
const sql = read(SITTER_MIGRATION);
const parentSql = read(PARENT_MIGRATION);

const NEW_SITTER = "2026-09-07T12:00:00.000Z";
const EXISTING_SITTER = "2026-08-01T00:00:00.000Z";

function offerInput(overrides: Partial<Parameters<typeof shouldAutoOfferSitterTour>[0]> = {}) {
  return {
    authenticated: true,
    role: "sitter" as const,
    pathname: "/sitter/dashboard",
    sitterOnboardingCompletedAt: NEW_SITTER,
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
    tour_key: "sitter" as const,
    offered_at: null,
    started_at: null,
    completed_at: null,
    declined_at: null,
    skipped_at: null,
    ...overrides
  };
}

function memoryStore(): SitterTourSessionStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
}

const EXPECTED_STEP_IDS = [
  "sitter-home",
  "sitter-work-schedule",
  "sitter-work-schedule-explain",
  "sitter-work-schedule-parents",
  "sitter-shifts",
  "sitter-shift-board",
  "sitter-messages",
  "sitter-messages-chat",
  "sitter-whatsapp",
  "sitter-after-shift",
  "sitter-personal-area",
  "sitter-identity-verification",
  "sitter-payment-methods",
  "sitter-preferred-payment",
  "sitter-wallet",
  "sitter-surprises",
  "sitter-settings"
];

// 1. fresh eligible sitter sees invitation once
assert.equal(shouldAutoOfferSitterTour(offerInput()), true);
assert.equal(shouldAutoOfferSitterTour(offerInput({ tour: tourRow({ offered_at: NEW_SITTER }) })), false);
assert.match(provider, /phase === "invite"/);
assert.match(modals, /SITTER_TOUR_COPY\.inviteTitle/);
assert.equal(SITTER_TOUR_COPY.inviteTitle, "בואו להכיר את AnyNanny!");
assert.equal(
  SITTER_TOUR_COPY.inviteBody,
  "הכנו לכן סיור קצר שיעבור איתכן על הדברים החשובים באפליקציה — סידור העבודה, משמרות, הודעות, אזור אישי, קבלת תשלום ועוד."
);
assert.equal(shouldAutoOfferSitterTour(offerInput({ pathname: "/sitter/shifts" })), false);
assert.equal(shouldAutoOfferSitterTour(offerInput({ pathname: "/sitter/onboarding" })), false);
assert.equal(shouldAutoOfferSitterTour(offerInput({ authenticated: false })), false);
assert.equal(shouldAutoOfferSitterTour(offerInput({ role: "parent" })), false);
assert.match(sitterLayout, /<SitterTourProvider>/);
const sitterProviderIdx = sitterLayout.indexOf("<SitterTourProvider>");
const sitterGateIdx = sitterLayout.indexOf("<ProductPortalGate");
assert.ok(
  sitterProviderIdx >= 0 && sitterGateIdx > sitterProviderIdx,
  "sitter tour provider must wrap ProductPortalGate so route changes do not reset the tour"
);

// 2. כן, תראו לי starts sitter tour
assert.equal(SITTER_TOUR_COPY.invitePrimary, "כן, תראו לי");
assert.match(provider, /onAccept=\{startTour\}/);
assert.match(provider, /setPhase\("touring"\)/);
assert.match(persistence, /markSitterTourStarted/);
assert.match(provider, /markSitterTourStarted/);

// 3. לא עכשיו shows settings reminder
assert.equal(SITTER_TOUR_COPY.inviteSecondary, "לא עכשיו");
assert.equal(SITTER_TOUR_COPY.declinedBody, "תוכלו לראות את ההדרכה בכל רגע דרך ⚙️ הגדרות.");
assert.equal(SITTER_TOUR_COPY.declinedConfirm, "הבנתי");
assert.match(provider, /onDecline=\{declineTour\}/);
assert.match(provider, /phase === "declined-ack"/);

// 4. declined sitter does not auto-invite again
assert.equal(shouldAutoOfferSitterTour(offerInput({ tour: tourRow({ declined_at: NEW_SITTER }) })), false);
assert.equal(hasProductTourChoice(tourRow({ declined_at: NEW_SITTER })), true);

// 5. completed sitter does not auto-invite again
assert.equal(
  shouldAutoOfferSitterTour(
    offerInput({
      tour: tourRow({
        offered_at: NEW_SITTER,
        started_at: NEW_SITTER,
        completed_at: NEW_SITTER
      })
    })
  ),
  false
);
assert.match(provider, /markSitterTourCompleted/);
assert.equal(SITTER_TOUR_COPY.completionTitle, "את מוכנה להתחיל!");
assert.equal(
  SITTER_TOUR_COPY.completionBody,
  "עכשיו אפשר לעדכן זמינות, להשלים את הפרופיל, להגדיר אמצעי קבלת תשלום ולהתחיל לקבל פניות למשמרות."
);
assert.equal(SITTER_TOUR_COPY.completionPrimary, "לסידור העבודה");
assert.equal(SITTER_TOUR_COPY.completionSecondary, "לאזור האישי");
assert.match(provider, /closeCompletion\(SITTER_TOUR_SCHEDULE_PATH\)/);
assert.match(provider, /closeCompletion\(SITTER_TOUR_PROFILE_PATH\)/);
assert.equal(SITTER_TOUR_SCHEDULE_PATH, "/sitter/availability");
assert.equal(SITTER_TOUR_PROFILE_PATH, "/sitter/profile");

// 6. skipped sitter does not auto-invite again
assert.equal(shouldAutoOfferSitterTour(offerInput({ tour: tourRow({ skipped_at: NEW_SITTER }) })), false);
assert.equal(shouldAutoOfferSitterTour(offerInput({ tour: tourRow({ started_at: NEW_SITTER }) })), false);
assert.match(provider, /markSitterTourSkipped/);
assert.match(engine, /PARENT_TOUR_COPY\.skip/);
assert.equal(SITTER_TOUR_COPY.skip, "דלג על הסיור");
assert.equal(SITTER_TOUR_COPY.skip, PARENT_TOUR_COPY.skip);

// 7. Settings restarts sitter tour
assert.equal(SITTER_TOUR_COPY.settingsTitle, "מדריך שימוש באפליקציה");
assert.equal(SITTER_TOUR_COPY.settingsSubtitle, "הפעילו מחדש את הסיור הקצר של AnyNanny.");
assert.match(sitterSettings, /SitterTourSettingsEntry/);
assert.match(settingsEntry, /restartSitterTour/);
assert.match(provider, /SITTER_TOUR_DASHBOARD_PATH/);
const restartBlock = provider.slice(provider.indexOf("const restartSitterTour"));
assert.match(restartBlock, /setPhase\("touring"\)/);
assert.match(restartBlock, /setStepIndex\(0\)/);
assert.doesNotMatch(restartBlock.slice(0, 800), /shouldAutoOfferSitterTour/);
assert.equal(canRestartSitterTour({ authenticated: true, role: "sitter" }), true);
assert.equal(canRestartSitterTour({ authenticated: true, role: "parent" }), false);
assert.doesNotMatch(sitterSettings, /ParentTourSettingsEntry|restartParentTour/);
assert.doesNotMatch(parentSettings, /SitterTourSettingsEntry|restartSitterTour/);

// 8. sitter schedule step targets real schedule UI
const scheduleEntry = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-work-schedule");
const scheduleExplain = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-work-schedule-explain");
assert.equal(scheduleEntry?.targetSelector, SITTER_TOUR_SELECTORS.workSchedule);
assert.equal(scheduleEntry?.advanceMode, "click-target");
assert.equal(scheduleExplain?.targetSelector, SITTER_TOUR_SELECTORS.workScheduleContainer);
assert.equal(scheduleExplain?.route, SITTER_TOUR_SCHEDULE_PATH);
assert.match(dashboard, /data-tour="sitter-work-schedule"/);
assert.match(dashboard, /href="\/sitter\/availability"/);
assert.match(availability, /data-tour="sitter-work-schedule-container"/);

// 9. work-schedule explanation does not modify availability
assert.equal(scheduleExplain?.blockTargetAction, true);
assert.equal(
  SITTER_TOUR_STEPS.find((step) => step.id === "sitter-work-schedule-parents")?.blockTargetAction,
  true
);
assert.doesNotMatch(provider, /saveAvailabilityForDate/);
assert.doesNotMatch(read("lib/product-tour/sitter-steps.ts"), /saveAvailabilityForDate/);
assert.match(availability, /saveAvailabilityForDate/);
assert.match(engine, /blockTargetAction/);
assert.match(engine, /pointer-events-auto absolute/);

// 10. shift-board step works without a pending booking
const shiftBoard = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-shift-board");
assert.equal(shiftBoard?.targetSelector, SITTER_TOUR_SELECTORS.shiftBoard);
assert.equal(shiftBoard?.advanceMode, "next-button");
assert.equal(shiftBoard?.blockTargetAction, true);
assert.match(shiftsPage, /data-tour="sitter-shift-board"/);
assert.match(dashboard, /data-tour="sitter-shifts"/);
assert.doesNotMatch(read("lib/product-tour/sitter-steps.ts"), /pendingBooking|requiresPending/);

// 11. sitter Messages sequence works
const messagesStep = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-messages");
const chatStep = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-messages-chat");
assert.equal(messagesStep?.advanceMode, "click-target");
assert.equal(messagesStep?.targetSelector, SITTER_TOUR_SELECTORS.messages);
assert.equal(chatStep?.advanceMode, "next-button");
assert.match(bottomNav, /tour: "sitter-messages"/);
assert.match(inboxUi, /tourAnchor="sitter-messages-chat"/);
assert.match(sitterChatPage, /data-tour="sitter-messages-chat"/);
assert.doesNotMatch(sitterChatPage, /data-tour="messages-chat"/);
assert.doesNotMatch(
  inboxUi.slice(inboxUi.indexOf("export function SitterBookingChatInbox")),
  /tourAnchor="messages-chat"/
);

// 12. WhatsApp step works without eligible WhatsApp button
const whatsappStep = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-whatsapp");
assert.ok(whatsappStep);
assert.equal(whatsappStep?.targetSelector, SITTER_TOUR_SELECTORS.whatsappHandoff);
assert.equal(whatsappStep?.fallbackSelector, SITTER_TOUR_SELECTORS.messagesChat);
assert.equal(
  firstPresentTourSelector(
    [whatsappStep?.targetSelector, whatsappStep?.fallbackSelector],
    (selector) => selector === SITTER_TOUR_SELECTORS.messagesChat
  ),
  SITTER_TOUR_SELECTORS.messagesChat
);
assert.match(whatsappAction, /data-tour="whatsapp-handoff"/);

// 13. WhatsApp is not actually opened
assert.equal(whatsappStep?.advanceMode, "next-button");
assert.equal(whatsappStep?.blockTargetAction, true);
assert.doesNotMatch(read("lib/product-tour/sitter-steps.ts"), /window\.open|wa\.me|api\.whatsapp/);
assert.doesNotMatch(provider, /window\.open|wa\.me/);
assert.match(engine, /if \(step\.preserveTargetState \|\| step\.blockTargetAction\)/);

// 14. payment receiving explanation works
const paymentStep = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-payment-methods");
assert.equal(paymentStep?.targetSelector, SITTER_TOUR_SELECTORS.paymentMethods);
assert.equal(paymentStep?.advanceMode, "next-button");
assert.equal(paymentStep?.blockTargetAction, true);
assert.match(personal, /data-tour="sitter-payment-methods"/);
assert.match(personal, /SitterManualReceivingDestinationsSection/);

// 15. preferred payment explanation works without changing preference
const preferredStep = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-preferred-payment");
assert.equal(preferredStep?.targetSelector, SITTER_TOUR_SELECTORS.preferredPayment);
assert.equal(preferredStep?.fallbackSelector, SITTER_TOUR_SELECTORS.paymentMethods);
assert.equal(preferredStep?.advanceMode, "next-button");
assert.equal(preferredStep?.blockTargetAction, true);
assert.match(paymentSection, /data-tour="sitter-preferred-payment"/);
assert.doesNotMatch(read("lib/product-tour/sitter-steps.ts"), /selectPreferred/);
assert.doesNotMatch(provider, /selectPreferred/);
assert.match(paymentSection, /selectPreferred/);

// 16. wallet step does not mutate financial data
const walletStep = SITTER_TOUR_STEPS.find((step) => step.id === "sitter-wallet");
assert.equal(walletStep?.targetSelector, SITTER_TOUR_SELECTORS.wallet);
assert.equal(walletStep?.advanceMode, "click-target");
assert.match(dashboard, /data-tour="sitter-wallet"/);
assert.match(walletPage, /data-tour="sitter-wallet-container"/);
assert.doesNotMatch(read("lib/product-tour/sitter-steps.ts"), /payout-methods|fetchSitterWalletView/);
assert.doesNotMatch(provider, /payout-methods|fetchSitterWalletView/);

// 17. parent tour remains unchanged
assert.equal(PARENT_TOUR_KEY, "parent");
assert.equal(SITTER_TOUR_KEY, "sitter");
assert.equal(
  PARENT_TOUR_STEPS.map((step) => step.id).join(","),
  [
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
  ].join(",")
);
assert.equal(
  PARENT_TOUR_COPY.inviteBody,
  "הכנו לכם סיור קצר שיעבור איתכם על הדברים החשובים באפליקציה — חיפוש בייביסיטר, AnyNanny NOW!, הודעות, אזור אישי ועוד."
);
assert.match(parentLayout, /<ParentTourProvider>/);
assert.doesNotMatch(parentLayout, /SitterTourProvider/);
assert.doesNotMatch(sitterLayout, /ParentTourProvider/);
assert.match(parentSettings, /ParentTourSettingsEntry/);
assert.doesNotMatch(parentSteps, /sitter-home|SITTER_TOUR/);
assert.doesNotMatch(parentProvider, /SITTER_TOUR_KEY|restartSitterTour/);
assert.doesNotMatch(parentModals, /SITTER_TOUR_COPY/);
assert.match(parentPersonal, /data-tour="identity-verification"/);
assert.doesNotMatch(personal, /data-tour="identity-verification"/);
assert.match(personal, /data-tour="sitter-identity-verification"/);
assert.match(parentChatPage, /data-tour="messages-chat"/);
assert.equal(shouldAutoOfferParentTour({
  authenticated: true,
  role: "parent",
  pathname: "/parent/dashboard",
  parentOnboardingCompletedAt: NEW_SITTER,
  tour: null
}), true);
assert.equal(canRestartParentTour({ authenticated: true, role: "parent" }), true);
assert.equal(canRestartParentTour({ authenticated: true, role: "sitter" }), false);

// 18. Android/TWA/Google Play untouched
const tourSources = [
  engine,
  provider,
  modals,
  settingsEntry,
  persistence,
  eligibility,
  sql,
  sitterLayout,
  sitterSettings
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
assert.equal(readdirSync(resolve(gitRoot, "android")).includes("app"), true);

// 19. persistence failure does not create an invite loop
assert.match(provider, /rememberSitterTourChoice/);
assert.match(provider, /readSitterTourSession/);
assert.match(persistence, /user_product_tours is unavailable/);
assert.match(provider, /console\.warn/);
assert.doesNotMatch(provider, /offeredOnce/);
const sessionStore = memoryStore();
const remembered = rememberSitterTourChoice("u", null, { declined_at: NEW_SITTER }, sessionStore);
assert.equal(hasProductTourChoice(remembered), true);
assert.equal(
  shouldAutoOfferSitterTour(offerInput({ tour: null, sessionTour: remembered })),
  false
);
assert.equal(
  shouldAutoOfferSitterTour(
    offerInput({
      tour: null,
      sessionTour: rememberSitterTourChoice("u", null, { offered_at: NEW_SITTER }, memoryStore())
    })
  ),
  false
);
assert.match(sitterTourSessionKey("u"), /anynanny_sitter_tour_choice:u/);
assert.equal(
  hasProductTourChoice(mergeProductTourRows(SITTER_TOUR_KEY, null, tourRow({ declined_at: NEW_SITTER }))),
  true
);

// 20. session remount does not reopen invitation
assert.equal(
  shouldAutoOfferSitterTour(
    offerInput({
      tour: null,
      sessionTour: rememberSitterTourChoice("u", null, { completed_at: NEW_SITTER }, memoryStore())
    })
  ),
  false
);
assert.equal(
  shouldAutoOfferSitterTour(
    offerInput({
      tour: null,
      sessionTour: rememberSitterTourChoice("u", null, { skipped_at: NEW_SITTER }, memoryStore())
    })
  ),
  false
);
assert.match(provider, /setTourRow\(\(prev\) => rememberSitterTourChoice/);
assert.match(provider, /mergeProductTourRows\(SITTER_TOUR_KEY, prev, sessionRow, row\)/);

// Rollout: existing sitters are Settings-only
assert.equal(isOnboardingCompletedAfterRollout(EXISTING_SITTER, SITTER_PRODUCT_TOUR_AUTO_OFFER_AFTER), false);
assert.equal(isOnboardingCompletedAfterRollout(NEW_SITTER, SITTER_PRODUCT_TOUR_AUTO_OFFER_AFTER), true);
assert.equal(
  shouldAutoOfferSitterTour(offerInput({ sitterOnboardingCompletedAt: EXISTING_SITTER })),
  false
);
assert.equal(SITTER_PRODUCT_TOUR_AUTO_OFFER_AFTER, "2026-09-07T00:00:00.000Z");
assert.equal(SITTER_TOUR_DASHBOARD_PATH, "/sitter/dashboard");

// Persistence / RLS
assert.match(sql, /tour_key in \('parent', 'sitter'\)/);
assert.match(sql, /user_id = auth\.uid\(\)/);
assert.doesNotMatch(sql, /grant delete/);
assert.doesNotMatch(sql, /service_role/);
assert.doesNotMatch(sql, /identity_id_number|child_special_or_medical/);
assert.match(parentSql, /create table if not exists public\.user_product_tours/);
assert.equal(USER_PRODUCT_TOURS_TABLE, "user_product_tours");
assert.match(persistence, /upsertSitterProductTour/);
assert.match(persistence, /eq\("tour_key", tourKey\)/);

// Selectors + step order
assert.equal(SITTER_TOUR_STEPS.map((step) => step.id).join(","), EXPECTED_STEP_IDS.join(","));
assert.equal(getSitterTourStep(99), null);
assert.match(dashboard, /data-tour="sitter-home"/);
assert.match(bottomNav, /tour: "sitter-personal-area"/);
assert.match(bottomNav, /tour: "sitter-settings"/);
assert.match(bottomNav, /data-tour="sitter-surprises"/);
const parentNavBlock = bottomNav.slice(
  bottomNav.indexOf("const parentSideItems"),
  bottomNav.indexOf("const sitterItems")
);
assert.doesNotMatch(parentNavBlock, /sitter-messages|sitter-personal-area|sitter-settings/);

// Route auto-nav for dashboard-only cards after leaving availability/profile
assert.match(provider, /router\.push\(currentStep\.route\)/);
assert.equal(matchesTourRoute("/sitter/availability", "/sitter/dashboard", true), false);
assert.equal(matchesTourRoute("/sitter/dashboard", "/sitter/dashboard", true), true);
assert.equal(matchesTourRoute("/sitter/messages", "/sitter/messages", true), true);
assert.equal(matchesTourRoute("/sitter/chat/abc", "/sitter/messages", true), false);

// Compact tooltip stays shared
assert.equal(TOUR_TOOLTIP_MAX_WIDTH_PX, 320);
assert.equal(TOUR_TOOLTIP_MIN_WIDTH_PX, 280);
assert.equal(clampTourTooltipWidth(400, 390), 320);
assert.match(engine, /max-w-\[320px\]/);
assert.match(engine, /w-\[min\(20rem,calc\(100vw-1\.5rem\)\)\]/);
assert.match(engine, /scrollIntoView/);
assert.doesNotMatch(provider, /new Audio|speechSynthesis|play\(\)/);
assert.doesNotMatch(engine, /new Audio|speechSynthesis/);
assert.match(modals, /AUTH_MODAL_OVERLAY_SCROLL/);
assert.match(modals, /dir="rtl"/);

console.log("sitter-product-tour: ok");
