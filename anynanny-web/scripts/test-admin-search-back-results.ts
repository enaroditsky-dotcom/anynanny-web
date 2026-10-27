import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_SEARCH_ENTRIES,
  adminSearchKeyAction,
  searchAdminDestinations,
  summarizeAdminSearchIndex
} from "../lib/admin/admin-search";
import {
  ADMIN_LANDING_HREF,
  adminLandingFallback,
  canonicalAdminHref,
  emptyAdminNavState,
  markAdminFallback,
  parseAdminNavState,
  prepareAdminBack,
  recordAdminVisit
} from "../lib/admin/admin-navigation";
import { shouldLoadQuestionDetail } from "../lib/admin/broadcast-question-detail-panel";
import {
  ADMIN_FLOATING_BACK_CONTENT_GAP,
  ADMIN_FLOATING_BACK_HEADER_GAP,
  placeFloatingAdminBackButton
} from "../lib/admin/admin-floating-back";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const summary = summarizeAdminSearchIndex();
assert.equal(summary.total, ADMIN_SEARCH_ENTRIES.length);
assert.equal(summary.pages, 4);
assert.ok(summary.tabs >= 4);
assert.ok(summary.sections >= 4);
assert.ok(summary.functions >= 8);
assert.equal(new Set(ADMIN_SEARCH_ENTRIES.map((item) => item.id)).size, ADMIN_SEARCH_ENTRIES.length);

for (const item of ADMIN_SEARCH_ENTRIES) {
  assert.equal(canonicalAdminHref(item.href), item.href);
  assert.match(item.href, /^\/admin\/(reports|shift-reviews|chat-logs|broadcast)(?:\?[^#]*)?(?:#[a-z0-9-]+)?$/);
  assert.doesNotMatch(item.href, /\/admin\/login|\/api\/|https?:|password|service_role|@/);
  assert.ok(item.title.trim().length > 0);
  assert.ok(item.section.trim().length > 0);
  assert.ok(item.description.trim().length > 0);
}

function first(query: string) {
  const results = searchAdminDestinations(query);
  assert.ok(results.length > 0, query);
  return results[0];
}

assert.equal(first("תוצאות שאלות").id, "broadcast-results");
assert.equal(first("שאלות בדיקה").href, "/admin/broadcast?results=test#admin-broadcast-results");
assert.equal(first("שאלות אמיתיות").href, "/admin/broadcast?results=real#admin-broadcast-results");
assert.equal(first("Broadcast").id, "broadcast");
assert.equal(first("BROADCAST").id, "broadcast");
assert.ok(searchAdminDestinations("broad").some((item) => item.id === "broadcast"));
assert.equal(first("הודעות מערכת").id, "broadcast");
assert.equal(first("נמענים נבחרים לפי ID").id, "broadcast-message-selected");
assert.match(first("selected recipients").href, /audience=selected_public_ids/);
assert.equal(first("Reports").id, "reports");
assert.equal(first("דוחות").id, "reports");
assert.equal(first("report").id, "reports");
assert.equal(first("Shift Reviews").id, "shift-reviews");
assert.equal(first("ביקורות משמרות").id, "shift-reviews");
assert.equal(first("rev").id, "shift-reviews");
assert.equal(first("Chat Logs").id, "chat-logs");
assert.equal(first("יומני צ'אט").id, "chat-logs");
assert.equal(first("whatsapp").href, "/admin/chat-logs?platform=whatsapp#admin-chat-log-filters");
assert.equal(first("שאלה אמריקאית").id, "broadcast-question");
assert.match(first("הורים בלבד").href, /composer=message&audience=parents#admin-broadcast-message-audience/);

const partialQuestions = searchAdminDestinations("שאל").map((item) => item.title);
assert.ok(partialQuestions.includes("שאלות אמיתיות"));
assert.ok(partialQuestions.includes("שאלות בדיקה"));
assert.ok(partialQuestions.includes("תוצאות שאלות"));

assert.deepEqual(searchAdminDestinations("   "), []);
assert.deepEqual(searchAdminDestinations("payroll"), []);
assert.deepEqual(searchAdminDestinations("הגדרות תשלום"), []);
assert.deepEqual(searchAdminDestinations("/api/admin/broadcast"), []);
assert.deepEqual(searchAdminDestinations("/admin/login"), []);

assert.equal(canonicalAdminHref("/admin/login"), null);
assert.equal(canonicalAdminHref("/parent/profile"), null);
assert.equal(canonicalAdminHref("https://evil.example/admin/reports"), null);
assert.equal(canonicalAdminHref("//evil.example/admin/reports"), null);
assert.equal(canonicalAdminHref("/admin/broadcast?audience=not-real"), "/admin/broadcast");
assert.equal(
  canonicalAdminHref("/admin/chat-logs?booking=secret-conversation&platform=telegram"),
  "/admin/chat-logs?platform=telegram"
);
assert.equal(canonicalAdminHref("/admin/broadcast?q=private%20note&results=test"), "/admin/broadcast?results=test");

assert.deepEqual(adminSearchKeyAction({ key: "ArrowDown", open: false, query: "a", activeIndex: 0, resultCount: 3 }), {
  type: "move",
  index: 0,
  open: true
});
assert.deepEqual(adminSearchKeyAction({ key: "ArrowDown", open: true, query: "a", activeIndex: 1, resultCount: 3 }), {
  type: "move",
  index: 2,
  open: true
});
assert.deepEqual(adminSearchKeyAction({ key: "ArrowUp", open: true, query: "a", activeIndex: 0, resultCount: 3 }), {
  type: "move",
  index: 0,
  open: true
});
assert.deepEqual(adminSearchKeyAction({ key: "Enter", open: true, query: "a", activeIndex: 1, resultCount: 3 }), {
  type: "select",
  index: 1
});
assert.deepEqual(adminSearchKeyAction({ key: "Enter", open: true, query: "missing", activeIndex: 0, resultCount: 0 }), {
  type: "none"
});
assert.deepEqual(adminSearchKeyAction({ key: "Escape", open: true, query: "a", activeIndex: 0, resultCount: 2 }), {
  type: "close"
});
assert.deepEqual(adminSearchKeyAction({ key: "Escape", open: false, query: "a", activeIndex: 0, resultCount: 2 }), {
  type: "clear"
});
assert.deepEqual(adminSearchKeyAction({ key: "Escape", open: false, query: " ", activeIndex: 0, resultCount: 0 }), {
  type: "none"
});

const reports = "/admin/reports";
const broadcast = "/admin/broadcast?composer=question#admin-broadcast-question";
const realResults = "/admin/broadcast?results=real#admin-broadcast-results";
let state = emptyAdminNavState();
state = recordAdminVisit(state, reports, 0);
assert.deepEqual(state.stack, []);
assert.equal(state.current, reports);
state = recordAdminVisit(state, broadcast, 180);
assert.equal(state.stack.length, 1);
assert.equal(state.stack[0]?.href, reports);
assert.equal(state.stack[0]?.scrollY, 180);
state = recordAdminVisit(state, realResults, 40);
const backToQuestion = prepareAdminBack(state);
assert.equal(backToQuestion.target, broadcast);
assert.equal(backToQuestion.scrollY, 40);
assert.equal(backToQuestion.state.pendingHref, broadcast);
assert.equal(backToQuestion.state.current, realResults);
const earlyBack = recordAdminVisit(backToQuestion.state, realResults, 0);
assert.equal(earlyBack.pendingHref, broadcast);
assert.equal(earlyBack.current, realResults);
state = recordAdminVisit(earlyBack, broadcast, 0);
assert.equal(state.current, broadcast);
assert.equal(state.pendingHref, null);
assert.equal(state.stack.map((item) => item.href).join("|"), reports);
const backToReports = prepareAdminBack(state);
assert.equal(backToReports.target, reports);
state = recordAdminVisit(backToReports.state, reports, 0);
assert.equal(state.stack.length, 0);
assert.equal(prepareAdminBack(state).target, null);
assert.equal(adminLandingFallback(reports), null);
assert.equal(adminLandingFallback("/admin/broadcast"), ADMIN_LANDING_HREF);

let direct = recordAdminVisit(emptyAdminNavState(), "/admin/chat-logs#admin-chat-logs", 0);
assert.equal(prepareAdminBack(direct).target, null);
assert.equal(adminLandingFallback(direct.current), ADMIN_LANDING_HREF);
const fallback = markAdminFallback(direct);
const earlyFallback = recordAdminVisit(fallback, "/admin/chat-logs#admin-chat-logs", 0);
assert.equal(earlyFallback.pendingHref, ADMIN_LANDING_HREF);
direct = recordAdminVisit(earlyFallback, ADMIN_LANDING_HREF, 0);
assert.equal(direct.stack.length, 0);
assert.equal(direct.pendingHref, null);
assert.equal(direct.current, ADMIN_LANDING_HREF);
assert.equal(prepareAdminBack(direct).target, null);

let loop = emptyAdminNavState();
loop = recordAdminVisit(loop, reports, 10);
loop = recordAdminVisit(loop, "/admin/shift-reviews#admin-shift-reviews", 20);
loop = recordAdminVisit(loop, reports, 0);
assert.equal(loop.stack.length, 0);
assert.equal(loop.current, reports);
const ignored = recordAdminVisit(loop, "/parent/home", 90);
assert.equal(ignored.current, reports);
assert.equal(ignored.stack.length, 0);
const poisoned = prepareAdminBack({
  ...emptyAdminNavState(),
  current: reports,
  stack: [
    { href: "https://evil.example/admin/reports", scrollY: 5 },
    { href: "/parent/profile", scrollY: 5 }
  ]
});
assert.equal(poisoned.target, null);
assert.deepEqual(poisoned.state.stack, []);

const restored = parseAdminNavState({
  current: "/admin/broadcast?token=secret&results=test#admin-broadcast-results",
  stack: [
    { href: "/admin/reports?details=private", scrollY: 12 },
    { href: "https://evil.example/steal", scrollY: 4 }
  ],
  pendingScroll: 12
});
assert.equal(restored.current, "/admin/broadcast?results=test#admin-broadcast-results");
assert.deepEqual(restored.stack, [{ href: reports, scrollY: 12 }]);
assert.equal(parseAdminNavState("nope").current, null);

assert.equal(shouldLoadQuestionDetail(false, null, "a"), false);
assert.equal(shouldLoadQuestionDetail(false, "a", "a"), false);
assert.equal(shouldLoadQuestionDetail(true, null, "a"), true);
assert.equal(shouldLoadQuestionDetail(true, "a", "b"), true);
assert.equal(shouldLoadQuestionDetail(true, "a", "a"), false);

const searchUi = read("components/admin/admin-global-search.tsx");
const topBar = read("components/admin/admin-top-bar.tsx");
const backButton = read("components/admin/admin-back-button.tsx");
const resultsUi = read("components/admin/admin-broadcast-question-results.tsx");
const composer = read("components/admin/admin-broadcast-composer.tsx");
const broadcastPage = read("app/admin/broadcast/page.tsx");

assert.match(searchUi, /from \"lucide-react\"/);
assert.match(searchUi, /<Search/);
assert.match(searchUi, /aria-hidden="true"/);
assert.match(searchUi, /absolute left-3/);
assert.match(searchUi, /type="search"/);
assert.match(searchUi, /חפש תפריט או פעולה באדמין\.\.\./);
assert.match(searchUi, /ArrowDown|adminSearchKeyAction/);
assert.match(searchUi, /role="combobox"/);
assert.match(searchUi, /role="listbox"/);
assert.match(searchUi, /dir="rtl"/);
assert.match(searchUi, /min-h-11 w-full/);
assert.match(searchUi, /max-h-\[min\(24rem,70vh\)\]/);
assert.match(searchUi, /router\.push\(href\)/);
assert.doesNotMatch(searchUi, /fetch\(|router\.back\(|window\.location\s*=/);
assert.match(topBar, /חזור|AdminBackButton/);
assert.match(topBar, /grid-cols-\[auto_auto\]/);
assert.match(topBar, /sm:grid-cols-\[auto_minmax\(12rem,1fr\)_auto\]/);
assert.match(topBar, /\/admin\/reports/);
assert.match(topBar, /\/admin\/shift-reviews/);
assert.match(topBar, /\/admin\/chat-logs/);
assert.match(topBar, /\/admin\/broadcast/);
assert.doesNotMatch(topBar, /router\.back\(/);
assert.match(backButton, /חזור/);
assert.match(backButton, /type="button"/);
assert.match(backButton, /dir="rtl"/);
assert.match(backButton, /M7 4\.5 12\.5 10 7 15\.5/);
assert.match(backButton, /aria-label="חזור"/);
assert.match(backButton, /IntersectionObserver/);
assert.match(backButton, /useState\(true\)/);
assert.match(backButton, /variant === "floating"/);
assert.match(backButton, /placeFloatingAdminBackButton/);
assert.match(backButton, /ResizeObserver/);
assert.doesNotMatch(backButton, /bottom-\[max\(1\.25rem/);

const desktop = placeFloatingAdminBackButton({
  viewportWidth: 1440,
  viewportHeight: 900,
  safeLeft: 0,
  safeRight: 0,
  safeTop: 0,
  safeBottom: 0,
  contentViewportTop: 84,
  contentLeft: 208,
  buttonWidth: 96,
  buttonHeight: 44
});
assert.equal(desktop.top, 84 + ADMIN_FLOATING_BACK_HEADER_GAP);
assert.ok(desktop.top >= 100 && desktop.top <= 140);
assert.equal(desktop.left + 96 + ADMIN_FLOATING_BACK_CONTENT_GAP, 208);

const laptop = placeFloatingAdminBackButton({
  viewportWidth: 1280,
  viewportHeight: 800,
  safeLeft: 0,
  safeRight: 0,
  safeTop: 0,
  safeBottom: 0,
  contentViewportTop: 84,
  contentLeft: 128,
  buttonWidth: 96,
  buttonHeight: 44
});
assert.equal(laptop.left + 96 + ADMIN_FLOATING_BACK_CONTENT_GAP, 128);

const phone = placeFloatingAdminBackButton({
  viewportWidth: 390,
  viewportHeight: 844,
  safeLeft: 0,
  safeRight: 0,
  safeTop: 47,
  safeBottom: 34,
  contentViewportTop: 131,
  contentLeft: 16,
  buttonWidth: 96,
  buttonHeight: 44
});
assert.ok(phone.left >= 0);
assert.ok(phone.left + 96 <= 390);
assert.ok(phone.top >= 131);
assert.ok(phone.top + 44 < 844 - 34);

const zoomed = placeFloatingAdminBackButton({
  viewportWidth: 320,
  viewportHeight: 500,
  safeLeft: 12,
  safeRight: 12,
  safeTop: 0,
  safeBottom: 0,
  contentViewportTop: 84,
  contentLeft: 8,
  buttonWidth: 96,
  buttonHeight: 44
});
assert.ok(zoomed.left >= 12);
assert.ok(zoomed.left + 96 <= 320 - 12);
assert.ok(zoomed.top >= 84);

const withoutHeader = placeFloatingAdminBackButton({
  viewportWidth: 1280,
  viewportHeight: 800,
  safeLeft: 0,
  safeRight: 0,
  safeTop: 0,
  safeBottom: 0,
  contentViewportTop: 0,
  contentLeft: 128,
  buttonWidth: 96,
  buttonHeight: 44
});
assert.ok(withoutHeader.top >= 100 && withoutHeader.top <= 140);
assert.match(backButton, /focus-visible:outline/);
assert.match(backButton, /onClick=\{onBack\}/);
assert.doesNotMatch(backButton, /addEventListener\(\s*["']scroll["']/);
assert.doesNotMatch(backButton, /sessionStorage|router\.back\(/);
assert.match(topBar, /headerBackVisible \? null/);
assert.match(topBar, /variant="floating"/);
assert.match(topBar, /useAdminHeaderBackVisible/);
assert.match(topBar, /onBack=\{goBack\}/);
assert.match(composer, /composer/);
assert.match(composer, /hidden/);
assert.match(broadcastPage, /requireAdminPage/);
assert.match(read("app/admin/reports/page.tsx"), /requireAdminPage/);
assert.match(read("app/admin/shift-reviews/page.tsx"), /requireAdminPage/);
assert.match(read("app/admin/chat-logs/page.tsx"), /requireAdminPage/);

assert.match(resultsUi, /useState\(false\)/);
assert.match(resultsUi, /function QuestionResultsCard/);
assert.match(resultsUi, /aria-expanded=\{open\}/);
assert.match(resultsUi, /aria-controls=\{panelId\}/);
assert.match(resultsUi, /סגור תוצאות מפורטות/);
assert.match(resultsUi, /תוצאות מפורטות/);
assert.match(resultsUi, /M5 7\.5 10 12\.5 15 7\.5/);
assert.match(resultsUi, /M5 12\.5 10 7\.5 15 12\.5/);
assert.match(resultsUi, /hidden=\{!open\}/);
assert.match(resultsUi, /shouldLoadQuestionDetail\(open, loadedKey, requestKey\)/);
assert.match(resultsUi, /שאלות אמיתיות/);
assert.match(resultsUi, /שאלות בדיקה/);
assert.match(resultsUi, /window\.confirm/);
assert.doesNotMatch(resultsUi, /setSelectedId|router\.back\(/);
const toggleSlice = resultsUi.slice(resultsUi.indexOf("aria-expanded={open}"), resultsUi.indexOf("סגור תוצאות מפורטות"));
assert.match(toggleSlice, /setOpen\(\(value\) => !value\)/);
assert.doesNotMatch(toggleSlice, /fetch\(|setStatus|setQuery|setOptionId/);
assert.doesNotMatch(resultsUi, /SUPABASE_SERVICE_ROLE_KEY|getSupabaseServiceRoleClient/);

console.log(
  `admin search/back/results checks passed (${summary.total} destinations: ${summary.pages} pages, ${summary.tabs} tabs, ${summary.sections} sections, ${summary.functions} functions)`
);
