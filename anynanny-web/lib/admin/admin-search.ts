import {
  BROADCAST_AUDIENCE_LABELS,
  BROADCAST_AUDIENCE_TYPES,
  type BroadcastAudienceType
} from "@/lib/admin/broadcast-audience";
import { canonicalAdminHref } from "@/lib/admin/admin-navigation";

export type AdminSearchKind = "page" | "tab" | "section" | "function";

export type AdminSearchEntry = {
  id: string;
  kind: AdminSearchKind;
  title: string;
  section: string;
  description: string;
  href: string;
  terms: string[];
};

const MESSAGE = "Broadcast רגיל";
const QUESTION = "Broadcast — שאלה אמריקאית";
const RESULTS = "תוצאות שאלות";

function entry(input: AdminSearchEntry): AdminSearchEntry {
  const href = canonicalAdminHref(input.href);
  if (!href || href !== input.href) {
    throw new Error(`Admin search destination is not a stable admin URL: ${input.id}`);
  }
  return input;
}

function audienceEntries(composer: "message" | "question", section: string, anchor: string): AdminSearchEntry[] {
  return BROADCAST_AUDIENCE_TYPES.filter((audience) => audience !== "selected_public_ids").map((audience) =>
    entry({
      id: `broadcast-${composer}-audience-${audience}`,
      kind: "function",
      title: BROADCAST_AUDIENCE_LABELS[audience],
      section,
      description: "בחירת קהל יעד. הניווט רק מציג את הבחירה ולא שולח הודעה או שאלה.",
      href: `/admin/broadcast?composer=${composer}&audience=${audience as BroadcastAudienceType}#${anchor}`,
      terms: ["קהל יעד", "audience", audience.replaceAll("_", " ")]
    })
  );
}

export const ADMIN_SEARCH_ENTRIES: readonly AdminSearchEntry[] = [
  entry({
    id: "reports",
    kind: "page",
    title: "Reports",
    section: "Admin",
    description: "Review in-app user reports, mark them resolved, and suspend or unsuspend an account.",
    href: "/admin/reports#admin-reports",
    terms: ["דוחות", "דיווחים", "דיווח", "user reports", "report", "menu", "תפריט"]
  }),
  entry({
    id: "reports-resolve",
    kind: "function",
    title: "Mark resolved",
    section: "Reports",
    description: "פותח את טבלת הדיווחים. הניווט לא מסמן דיווח כטופל.",
    href: "/admin/reports#admin-reports-table",
    terms: ["resolve", "resolved", "טופל", "סגירת דיווח", "status"]
  }),
  entry({
    id: "reports-suspend",
    kind: "function",
    title: "Suspend",
    section: "Reports",
    description: "פותח את פעולת ההשעיה בטבלת הדיווחים. הניווט לא משעה חשבון.",
    href: "/admin/reports#admin-reports-table",
    terms: ["suspend account", "השעיה", "חסימה"]
  }),
  entry({
    id: "reports-unsuspend",
    kind: "function",
    title: "Unsuspend",
    section: "Reports",
    description: "פותח את פעולת ביטול ההשעיה. הניווט לא מבטל השעיה.",
    href: "/admin/reports#admin-reports-table",
    terms: ["unsuspend", "ביטול השעיה"]
  }),
  entry({
    id: "shift-reviews",
    kind: "page",
    title: "Shift Reviews",
    section: "Admin",
    description: "Read-only queue for shifts released from a stuck live screen. No charge or end time is entered here.",
    href: "/admin/shift-reviews#admin-shift-reviews",
    terms: ["ביקורות משמרות", "ביקורת משמרת", "משמרות", "shift review", "stuck shift", "תקוע", "ממתינה לבדיקה"]
  }),
  entry({
    id: "chat-logs",
    kind: "page",
    title: "Chat Logs",
    section: "Admin",
    description: "Ops view of parent-sitter chat initiations before a session starts.",
    href: "/admin/chat-logs#admin-chat-logs",
    terms: ["יומני צ'אט", "יומן שיחות", "chat initiation", "צאט", "הודעות"]
  }),
  entry({
    id: "chat-log-filters",
    kind: "section",
    title: "Chat log filters",
    section: "Chat Logs",
    description: "Filter initiations by platform, booking id, or date. This does not search conversation content.",
    href: "/admin/chat-logs#admin-chat-log-filters",
    terms: ["platform", "booking id", "from date", "to date", "סינון", "מסנן"]
  }),
  entry({
    id: "chat-whatsapp",
    kind: "function",
    title: "WhatsApp",
    section: "Chat Logs",
    description: "Show WhatsApp initiations. Navigation only sets the platform filter.",
    href: "/admin/chat-logs?platform=whatsapp#admin-chat-log-filters",
    terms: ["וואטסאפ", "whatsapp", "chat logs"]
  }),
  entry({
    id: "chat-telegram",
    kind: "function",
    title: "Telegram",
    section: "Chat Logs",
    description: "Show Telegram initiations. Navigation only sets the platform filter.",
    href: "/admin/chat-logs?platform=telegram#admin-chat-log-filters",
    terms: ["טלגרם", "telegram", "chat logs"]
  }),
  entry({
    id: "broadcast",
    kind: "page",
    title: "Broadcast",
    section: "Admin",
    description: "שליחת הודעת מערכת או שאלה אמריקאית בתוך AnyNanny.",
    href: "/admin/broadcast#admin-broadcast",
    terms: ["הודעות מערכת", "שידור", "broadcast", "nanny talks", "נני טוקס", "menu", "תפריט"]
  }),
  entry({
    id: "broadcast-message",
    kind: "tab",
    title: MESSAGE,
    section: "Broadcast",
    description: "Compose a regular in-app broadcast. Navigation opens the tab and does not send.",
    href: "/admin/broadcast?composer=message#admin-broadcast-message",
    terms: ["הודעה רגילה", "regular broadcast", "message", "broadcast"]
  }),
  entry({
    id: "broadcast-question",
    kind: "tab",
    title: QUESTION,
    section: "Broadcast",
    description: "Compose a yes/no or multiple-choice question. Navigation opens the tab and does not send.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question",
    terms: ["שאלה אמריקאית", "question", "poll", "survey", "שאלון"]
  }),
  entry({
    id: "broadcast-message-selected",
    kind: "section",
    title: "נמענים נבחרים לפי ID",
    section: MESSAGE,
    description: "משתמשים נבחרים לפי מזהה ציבורי להודעה רגילה. הניווט פותח את השדה ולא שולח.",
    href: "/admin/broadcast?composer=message&audience=selected_public_ids#admin-broadcast-message-recipients",
    terms: ["משתמשים נבחרים לפי ID", "selected recipients", "selected public ids", "public id", "מזהים ציבוריים", "RP", "RAN"]
  }),
  entry({
    id: "broadcast-question-selected",
    kind: "section",
    title: "נמענים נבחרים לפי ID",
    section: QUESTION,
    description: "משתמשים נבחרים לפי מזהה ציבורי לשאלה. הניווט פותח את השדה ולא שולח.",
    href: "/admin/broadcast?composer=question&audience=selected_public_ids#admin-broadcast-question-recipients",
    terms: ["משתמשים נבחרים לפי ID", "selected recipients", "selected public ids", "question recipients"]
  }),
  entry({
    id: "broadcast-message-preview",
    kind: "function",
    title: "תצוגה מקדימה",
    section: MESSAGE,
    description: "Preview a regular broadcast. Navigation scrolls to the button and does not send.",
    href: "/admin/broadcast?composer=message#admin-broadcast-message-preview",
    terms: ["preview", "broadcast preview"]
  }),
  entry({
    id: "broadcast-message-test",
    kind: "function",
    title: "שליחת הודעת בדיקה לעצמי",
    section: MESSAGE,
    description: "פותח את כפתור בדיקת ההודעה. הניווט לא שולח בדיקה.",
    href: "/admin/broadcast?composer=message#admin-broadcast-message-test",
    terms: ["test message", "הודעת בדיקה", "self test"]
  }),
  entry({
    id: "broadcast-message-new",
    kind: "function",
    title: "הודעה חדשה",
    section: MESSAGE,
    description: "פותח את איפוס הטיוטה. הניווט לא מוחק טיוטה ולא שולח.",
    href: "/admin/broadcast?composer=message#admin-broadcast-message-new",
    terms: ["new message", "reset draft"]
  }),
  entry({
    id: "broadcast-message-cta",
    kind: "section",
    title: "תווית CTA",
    section: MESSAGE,
    description: "Optional internal button label and route for a regular broadcast.",
    href: "/admin/broadcast?composer=message#admin-broadcast-message-cta",
    terms: ["cta", "נתיב פנימי", "call to action"]
  }),
  entry({
    id: "broadcast-message-send",
    kind: "function",
    title: "שליחת Broadcast",
    section: MESSAGE,
    description: "כפתור השליחה מופיע אחרי תצוגה מקדימה. הניווט לא שולח הודעה.",
    href: "/admin/broadcast?composer=message#admin-broadcast-message-preview",
    terms: ["send broadcast", "שליחה למשתמשים"]
  }),
  entry({
    id: "broadcast-question-preview",
    kind: "function",
    title: "תצוגה מקדימה",
    section: QUESTION,
    description: "Preview a question. Navigation scrolls to the button and does not send.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question-preview",
    terms: ["preview question", "question preview"]
  }),
  entry({
    id: "broadcast-question-test",
    kind: "function",
    title: "שליחת בדיקה לחשבון P-1002",
    section: QUESTION,
    description: "פותח את כפתור שאלת הבדיקה. הניווט לא שולח בדיקה.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question-test",
    terms: ["test question", "שאלת בדיקה", "P-1002"]
  }),
  entry({
    id: "broadcast-question-new",
    kind: "function",
    title: "שאלה חדשה",
    section: QUESTION,
    description: "פותח את איפוס טיוטת השאלה. הניווט לא מוחק ולא שולח.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question-new",
    terms: ["new question"]
  }),
  entry({
    id: "broadcast-question-yes-no",
    kind: "function",
    title: "כן / לא",
    section: QUESTION,
    description: "Yes/no answer format. Navigation opens the question tab and does not send.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question-format",
    terms: ["yes no", "yes/no", "סוג תשובות"]
  }),
  entry({
    id: "broadcast-question-custom",
    kind: "function",
    title: "תשובות לבחירה",
    section: QUESTION,
    description: "Custom answer choices. Navigation opens the question tab and does not send.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question-format",
    terms: ["custom options", "הוסף תשובה"]
  }),
  entry({
    id: "broadcast-question-single",
    kind: "function",
    title: "בחירה אחת",
    section: QUESTION,
    description: "Single-choice selection. Navigation opens the question tab and does not send.",
      href: "/admin/broadcast?composer=question#admin-broadcast-question-format",
      terms: ["single choice", "אופן הבחירה"]
    }),
  entry({
    id: "broadcast-question-multiple",
    kind: "function",
    title: "כמה תשובות",
    section: QUESTION,
    description: "Multiple-choice selection. Navigation opens the question tab and does not send.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question-format",
    terms: ["multiple answers", "multi select"]
  }),
  entry({
    id: "broadcast-question-send",
    kind: "function",
    title: "שליחה לנמענים",
    section: QUESTION,
    description: "כפתור השליחה מופיע אחרי תצוגה מקדימה. הניווט לא שולח שאלה.",
    href: "/admin/broadcast?composer=question#admin-broadcast-question-preview",
    terms: ["send question", "שליחת שאלה"]
  }),
  entry({
    id: "broadcast-results",
    kind: "section",
    title: "תוצאות שאלות",
    section: "Broadcast",
    description: "Question history, response rate, and per-question detailed results.",
    href: "/admin/broadcast#admin-broadcast-results",
    terms: ["question results", "results", "תוצאות"]
  }),
  entry({
    id: "broadcast-results-real",
    kind: "tab",
    title: "שאלות אמיתיות",
    section: RESULTS,
    description: "Results for real questions. Navigation only switches the results mode.",
    href: "/admin/broadcast?results=real#admin-broadcast-results",
    terms: ["real questions", "production questions", "אמיתיות"]
  }),
  entry({
    id: "broadcast-results-test",
    kind: "tab",
    title: "שאלות בדיקה",
    section: RESULTS,
    description: "Results for test questions. Navigation only switches the results mode.",
    href: "/admin/broadcast?results=test#admin-broadcast-results",
    terms: ["test questions", "בדיקה"]
  }),
  entry({
    id: "broadcast-results-detail",
    kind: "function",
    title: "תוצאות מפורטות",
    section: RESULTS,
    description: "Expand a question's answer distribution and respondents. Navigation opens the list and does not change answers.",
    href: "/admin/broadcast#admin-broadcast-results",
    terms: ["detailed results", "סגור תוצאות מפורטות", "respondents"]
  }),
  entry({
    id: "broadcast-results-close",
    kind: "function",
    title: "סגירת שאלה",
    section: RESULTS,
    description: "כפתור הסגירה נמצא בתוך התוצאות המפורטות של כל שאלה. הניווט לא סוגר שאלה.",
    href: "/admin/broadcast#admin-broadcast-results",
    terms: ["close question", "לסגור את השאלה"]
  }),
  entry({
    id: "broadcast-results-filters",
    kind: "section",
    title: "סינון נמענים",
    section: RESULTS,
    description: "Filter respondents by status, answer, or public id inside an open question. Search does not query user records.",
    href: "/admin/broadcast#admin-broadcast-results",
    terms: ["respondent filter", "מזהה ציבורי", "לא ענו", "ענו", "status"]
  }),
  entry({
    id: "logout",
    kind: "function",
    title: "Logout",
    section: "Admin",
    description: "Focus the admin sign-out button. Navigation does not sign out.",
    href: "/admin/reports#admin-logout",
    terms: ["log out", "sign out", "התנתקות", "יציאה"]
  }),
  ...audienceEntries("message", MESSAGE, "admin-broadcast-message-audience"),
  ...audienceEntries("question", QUESTION, "admin-broadcast-question-audience")
];

export function summarizeAdminSearchIndex(entries: readonly AdminSearchEntry[] = ADMIN_SEARCH_ENTRIES): {
  total: number;
  pages: number;
  tabs: number;
  sections: number;
  functions: number;
} {
  return {
    total: entries.length,
    pages: entries.filter((item) => item.kind === "page").length,
    tabs: entries.filter((item) => item.kind === "tab").length,
    sections: entries.filter((item) => item.kind === "section").length,
    functions: entries.filter((item) => item.kind === "function").length
  };
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchAdminDestinations(query: string, entries: readonly AdminSearchEntry[] = ADMIN_SEARCH_ENTRIES): AdminSearchEntry[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  const scored: Array<{ entry: AdminSearchEntry; score: number; index: number }> = [];
  entries.forEach((item, index) => {
    const title = normalizeSearchText(item.title);
    const section = normalizeSearchText(item.section);
    const description = normalizeSearchText(item.description);
    const terms = normalizeSearchText(item.terms.join(" "));
    const haystack = `${title} ${section} ${description} ${terms}`;
    if (!tokens.every((token) => haystack.includes(token))) return;
    let score = 0;
    if (title === normalized) score += 100;
    else if (title.startsWith(normalized)) score += 70;
    else if (title.includes(normalized)) score += 50;
    for (const token of tokens) {
      if (title.includes(token)) score += 12;
      if (section.includes(token)) score += 4;
      if (terms.includes(token)) score += 6;
      if (description.includes(token)) score += 2;
    }
    scored.push({ entry: item, score, index });
  });
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.map((item) => item.entry);
}

export type AdminSearchKeyAction =
  | { type: "move"; index: number; open: true }
  | { type: "select"; index: number }
  | { type: "close" }
  | { type: "clear" }
  | { type: "none" };

export function adminSearchKeyAction(input: {
  key: string;
  open: boolean;
  query: string;
  activeIndex: number;
  resultCount: number;
}): AdminSearchKeyAction {
  const count = input.resultCount;
  if (input.key === "ArrowDown") {
    if (count < 1) return { type: "none" };
    const index = input.open ? Math.min(input.activeIndex + 1, count - 1) : 0;
    return { type: "move", index, open: true };
  }
  if (input.key === "ArrowUp") {
    if (count < 1) return { type: "none" };
    const index = input.open ? Math.max(input.activeIndex - 1, 0) : 0;
    return { type: "move", index, open: true };
  }
  if (input.key === "Enter") {
    if (count < 1) return { type: "none" };
    const index = Math.min(Math.max(input.activeIndex, 0), count - 1);
    return { type: "select", index };
  }
  if (input.key === "Escape") {
    if (input.open) return { type: "close" };
    if (input.query.trim()) return { type: "clear" };
    return { type: "none" };
  }
  return { type: "none" };
}
