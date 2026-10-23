import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  broadcastQuestionDismissPersistsRead,
  broadcastQuestionHref,
  broadcastQuestionIdFromPayload,
  omitAnsweredBroadcastQuestions
} from "../lib/broadcast/question-link";
import { broadcastQuestionSubmitMessage } from "../lib/broadcast/question-answer";
import { operationalCardActionLabel, shouldPersistOperationalCardRead } from "../lib/notifications/coordination";
import { notificationHrefForKind } from "../lib/notifications/kinds";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const questionId = "11111111-1111-4111-8111-111111111111";

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const answer = read("lib/broadcast/question-answer.ts");
const form = read("components/broadcast/broadcast-question-answer.tsx");
const cards = read("components/notifications/global-coordination-notifications.tsx");
const coordination = read("lib/notifications/coordination.ts");
const push = read("lib/push/deliver-notification.ts");
const regularRoute = read("app/api/admin/broadcast/route.ts");

assert.equal(broadcastQuestionIdFromPayload({ question_id: questionId }), questionId);
assert.equal(broadcastQuestionIdFromPayload({ question_id: "not-a-uuid" }), null);
assert.equal(broadcastQuestionIdFromPayload({ cta_route: "/parent/dashboard" }), null);
assert.equal(broadcastQuestionHref(questionId), `/broadcast/question/${questionId}`);

assert.equal(
  notificationHrefForKind("admin_broadcast", "parent", { question_id: questionId, cta_route: "/parent/profile" }),
  `/broadcast/question/${questionId}`
);
assert.equal(
  notificationHrefForKind("admin_broadcast", "parent", { cta_route: "/parent/settings" }),
  "/parent/settings"
);
assert.equal(
  notificationHrefForKind("admin_broadcast", "sitter", { cta_route: "https://evil.example" }),
  "/sitter/dashboard"
);
assert.equal(operationalCardActionLabel("admin_broadcast", { question_id: questionId }), "למענה");
assert.equal(operationalCardActionLabel("admin_broadcast", { cta_label: "לפרופיל" }), "לפרופיל");
assert.equal(operationalCardActionLabel("admin_broadcast", {}), "לפרטים");

const regular = { id: "n1", payload: { cta_route: "/parent/dashboard" } };
const question = { id: "n2", payload: { question_id: questionId } };
const other = { id: "n3", payload: { question_id: "22222222-2222-4222-8222-222222222222" } };
const visible = omitAnsweredBroadcastQuestions([regular, question, other], new Set([questionId]));
assert.deepEqual(visible.map((row) => row.id), ["n1", "n3"]);
assert.equal(broadcastQuestionDismissPersistsRead({ question_id: questionId }), false);
assert.equal(broadcastQuestionDismissPersistsRead({ cta_label: "לפרטים" }), true);
assert.equal(shouldPersistOperationalCardRead({ markRead: true, kind: "admin_broadcast" }), true);
assert.equal(shouldPersistOperationalCardRead({ markRead: false, kind: "admin_broadcast" }), false);

assert.equal(broadcastQuestionSubmitMessage({ message: "question is closed" }), "השאלה נסגרה. אי אפשר לענות עוד.");
assert.equal(broadcastQuestionSubmitMessage({ message: "not a recipient" }), "השאלה לא זמינה עבורך.");
assert.equal(broadcastQuestionSubmitMessage({ message: "single-choice questions accept one option" }), "יש לבחור תשובה אחת.");
assert.equal(broadcastQuestionSubmitMessage({ message: "at least one option is required" }), "יש לבחור לפחות תשובה אחת.");

assert.match(answer, /submit_broadcast_question_response/);
assert.match(answer, /auth\.getUser/);
assert.doesNotMatch(answer, /p_user_id|user_id:/);
assert.doesNotMatch(answer, /insert into public\.notifications|from\("notifications"\)\.insert/);
const savedCheck = answer.indexOf("const saved = savedOptionIds");
const publish = answer.indexOf("publishBroadcastQuestionAnswered(questionId)");
assert.ok(savedCheck > 0 && publish > savedCheck);
assert.match(answer, /fetchAnsweredBroadcastQuestionIds/);
assert.match(answer, /broadcast_question_responses/);

assert.match(form, /כן \/ לא|questionFormat === "yes_no"/);
assert.match(form, /type=\{multiple \? "checkbox" : "radio"\}/);
assert.match(form, /שליחת תשובה/);
assert.match(form, /התשובה נשמרה/);
assert.match(form, /dir="rtl"/);
assert.doesNotMatch(form, /localStorage|sessionStorage/);

assert.match(cards, /broadcastQuestionDismissPersistsRead/);
assert.match(cards, /userHasAnsweredBroadcastQuestion/);
assert.match(cards, /BROADCAST_QUESTION_ANSWERED_EVENT/);
const openStart = cards.indexOf("const openHref");
const openSlice = cards.slice(openStart, cards.indexOf("const routeItems"));
assert.ok(openSlice.indexOf("broadcastQuestionIdFromPayload(item.payload)") >= 0);
assert.ok(
  openSlice.indexOf("broadcastQuestionIdFromPayload(item.payload)") <
    openSlice.indexOf("markNotificationsReadBestEffort")
);
assert.match(coordination, /fetchAnsweredBroadcastQuestionIds/);
assert.match(coordination, /omitAnsweredBroadcastQuestions/);
assert.match(push, /kind === "admin_broadcast"/);
assert.doesNotMatch(regularRoute, /broadcast_question/);

console.log("broadcast question answer checks passed");
