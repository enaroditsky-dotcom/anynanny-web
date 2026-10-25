import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadUnansweredBroadcastQuestionNotice } from "../lib/broadcast/question-inbox";
import {
  EMPTY_UNANSWERED_NOTICE,
  extraUnansweredQuestionLabel,
  formatUnansweredQuestionBadge,
  noticeVisibleToUser,
  questionNoticeVisibleOnPath,
  reduceUnansweredNotice,
  selectDashboardQuestionCards,
  unansweredNoticeView,
  type UnansweredQuestionCandidate
} from "../lib/broadcast/question-visibility";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function question(
  id: string,
  createdAt: string,
  extras: { prompt?: string; answered?: boolean; closed?: boolean } = {}
): UnansweredQuestionCandidate {
  return {
    id,
    prompt: extras.prompt ?? `שאלה ${id}`,
    createdAt,
    answered: extras.answered ?? false,
    closed: extras.closed ?? false
  };
}

const openA = question("a", "2026-10-25T10:00:00Z");
const openB = question("b", "2026-10-25T11:00:00Z");
const openC = question("c", "2026-10-25T09:00:00Z");
const answered = question("answered", "2026-10-25T12:00:00Z", { answered: true });
const closed = question("closed", "2026-10-25T12:30:00Z", { closed: true });
const duplicate = question("b", "2026-10-25T08:00:00Z", { prompt: "עותק ישן" });

const one = unansweredNoticeView(
  reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, { type: "loaded", count: 1, questions: [openA] })
);
assert.equal(one.count, 1);
assert.equal(one.badge, "1");
assert.equal(one.card?.id, "a");
assert.equal(one.extraLabel, null);
assert.equal(one.inboxFallbackLabel, null);

const several = unansweredNoticeView(
  reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, {
    type: "loaded",
    count: 3,
    questions: [openA, openB, openC, duplicate, answered, closed]
  })
);
assert.equal(several.count, 3);
assert.equal(several.badge, "3");
assert.equal(several.card?.id, "b");
assert.equal(several.card?.prompt, "שאלה b");
assert.equal(several.extraLabel, "עוד 2 שאלות ממתינות");
assert.equal(
  selectDashboardQuestionCards([openA, openB, openC, duplicate, answered, closed]).length,
  1
);

const dismissed = reduceUnansweredNotice(
  reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, {
    type: "loaded",
    count: 2,
    questions: [openA, openB]
  }),
  { type: "dismiss", questionId: "b" }
);
const dismissedView = unansweredNoticeView(dismissed);
assert.equal(dismissedView.count, 2);
assert.equal(dismissedView.badge, "2");
assert.equal(dismissedView.card?.id, "a");
assert.equal(dismissedView.inboxFallbackLabel, null);
assert.deepEqual(dismissed.answeredIds, []);

const onlyDismissed = reduceUnansweredNotice(
  reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, { type: "loaded", count: 1, questions: [openA] }),
  { type: "dismiss", questionId: "a" }
);
const onlyDismissedView = unansweredNoticeView(onlyDismissed);
assert.equal(onlyDismissedView.count, 1);
assert.equal(onlyDismissedView.card, null);
assert.equal(onlyDismissedView.inboxFallbackLabel, "שאלה אחת ממתינה");
assert.deepEqual(onlyDismissed.answeredIds, []);
const answeredOnly = unansweredNoticeView(reduceUnansweredNotice(onlyDismissed, { type: "answered", questionId: "a" }));
assert.equal(answeredOnly.count, 0);
assert.equal(answeredOnly.badge, null);
assert.equal(answeredOnly.card, null);
assert.equal(answeredOnly.inboxFallbackLabel, null);

const dismissedAll = ["b", "a", "c"].reduce(
  (current, questionId) => reduceUnansweredNotice(current, { type: "dismiss", questionId }),
  reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, {
    type: "loaded",
    count: 25,
    questions: [openA, openB, openC]
  })
);
const dismissedAllView = unansweredNoticeView(dismissedAll);
assert.equal(dismissedAllView.count, 25);
assert.equal(dismissedAllView.badge, "25");
assert.equal(dismissedAllView.card, null);
assert.equal(dismissedAllView.inboxFallbackLabel, "25 שאלות ממתינות");
assert.deepEqual(dismissedAll.answeredIds, []);

const answeredAfterDismiss = unansweredNoticeView(
  reduceUnansweredNotice(dismissedAll, { type: "answered", questionId: "b" })
);
assert.equal(answeredAfterDismiss.count, 24);
assert.equal(answeredAfterDismiss.card, null);
assert.equal(answeredAfterDismiss.inboxFallbackLabel, "24 שאלות ממתינות");
assert.deepEqual(
  reduceUnansweredNotice(dismissedAll, { type: "answered", questionId: "b" }).answeredIds,
  ["b"]
);

const afterAnswer = unansweredNoticeView(
  reduceUnansweredNotice(
    reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, {
      type: "loaded",
      count: 2,
      questions: [openA, openB]
    }),
    { type: "answered", questionId: "b" }
  )
);
assert.equal(afterAnswer.count, 1);
assert.equal(afterAnswer.badge, "1");
assert.equal(afterAnswer.card?.id, "a");

const staleReload = unansweredNoticeView(
  reduceUnansweredNotice(
    reduceUnansweredNotice(
      reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, {
        type: "loaded",
        count: 1,
        questions: [openB]
      }),
      { type: "answered", questionId: "b" }
    ),
    { type: "loaded", count: 1, questions: [openB] }
  )
);
assert.equal(staleReload.count, 0);
assert.equal(staleReload.badge, null);
assert.equal(staleReload.card, null);

const failedFirst = unansweredNoticeView(reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, { type: "failed" }));
assert.equal(failedFirst.count, 0);
assert.equal(failedFirst.card, null);
const kept = reduceUnansweredNotice(
  reduceUnansweredNotice(EMPTY_UNANSWERED_NOTICE, { type: "loaded", count: 1, questions: [openA] }),
  { type: "failed" }
);
assert.equal(unansweredNoticeView(kept).count, 1);

assert.equal(formatUnansweredQuestionBadge(0), null);
assert.equal(formatUnansweredQuestionBadge(100), "99+");
assert.equal(extraUnansweredQuestionLabel(1), "עוד שאלה אחת ממתינה");
assert.equal(questionNoticeVisibleOnPath("/parent/dashboard", "a"), true);
assert.equal(questionNoticeVisibleOnPath("/sitter/dashboard", "a"), true);
assert.equal(questionNoticeVisibleOnPath("/parent/settings", "a"), true);
assert.equal(questionNoticeVisibleOnPath("/sitter/settings", "a"), true);
assert.equal(
  questionNoticeVisibleOnPath("/broadcast/question/11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"),
  false
);
assert.equal(unansweredNoticeView(reduceUnansweredNotice(kept, { type: "reset" })).count, 0);
assert.equal(
  noticeVisibleToUser({ ownerId: "parent-user", card: { id: "a", prompt: "שאלה" } }, "sitter-user"),
  null
);
assert.equal(
  noticeVisibleToUser({ ownerId: "parent-user", card: { id: "a", prompt: "שאלה" } }, "parent-user")?.card?.id,
  "a"
);
assert.equal(noticeVisibleToUser({ ownerId: null, card: null }, null)?.card, null);

const parentNav = read("components/bottom-nav.tsx");
const settingsLink = read("components/broadcast/my-questions-settings-link.tsx");
const card = read("components/broadcast/unanswered-question-card.tsx");
const overlay = read("components/notifications/global-coordination-notifications.tsx");
const coordination = read("lib/notifications/coordination.ts");
const inbox = read("lib/broadcast/question-inbox.ts");
const store = read("lib/broadcast/use-unanswered-questions.ts");

assert.match(parentNav, /href: "\/parent\/settings"/);
assert.match(parentNav, /href: "\/sitter\/settings"/);
assert.equal(parentNav.match(/badgeKey: "questions"/g)?.length, 2);
assert.match(parentNav, /data-unanswered-question-badge/);
assert.match(parentNav, /useUnansweredBroadcastQuestions/);
assert.match(settingsLink, /השאלות שלי/);
assert.match(settingsLink, /data-unanswered-question-badge/);
assert.match(settingsLink, /useUnansweredBroadcastQuestions/);
assert.match(card, /למענה/);
assert.match(card, /data-broadcast-question-card/);
assert.match(card, /dismissUnansweredQuestionCard\(card\.id\)/);
assert.doesNotMatch(card, /markNotificationsRead|read_at|localStorage|sessionStorage|publishBroadcastQuestionAnswered/);
const inboxCard = card.slice(card.indexOf("export function UnansweredQuestionsInboxCard"));
assert.match(inboxCard, /השאלות שלי/);
assert.match(inboxCard, /data-broadcast-question-inbox-card/);
assert.doesNotMatch(inboxCard, /dismissUnansweredQuestionCard|סגור|למענה/);
assert.match(overlay, /UnansweredQuestionCard/);
assert.match(overlay, /UnansweredQuestionsInboxCard/);
assert.match(overlay, /questionNoticeVisibleOnPath/);
assert.match(overlay, /!broadcastQuestionIdFromPayload\(row\.payload\)/);
assert.match(overlay, /refreshUnansweredBroadcastQuestions/);
assert.match(coordination, /payload->>question_id", "is", null/);
assert.match(coordination, /ordinaryAdminBroadcastsForReplay/);
assert.match(inbox, /loadUnansweredBroadcastQuestionNotice/);
assert.match(inbox, /\.eq\("user_id", userId\)/);
assert.match(store, /BROADCAST_QUESTION_ANSWERED_EVENT/);
assert.doesNotMatch(store, /localStorage|sessionStorage|setInterval/);
assert.doesNotMatch(read("lib/admin/broadcast-send.ts"), /loadUnansweredBroadcastQuestionNotice/);
assert.doesNotMatch(read("lib/admin/broadcast-question-send.ts"), /loadUnansweredBroadcastQuestionNotice/);

type InboxResult = {
  data: unknown;
  count: number | null;
  error: { code?: string; message: string } | null;
};

function inboxClient(responses: InboxResult[]) {
  const calls: string[] = [];
  let responseIndex = 0;
  const builder = (label: string) => {
    const api = {
      select(_columns: string, options?: { head?: boolean }) {
        calls.push(`${label}:select:${options?.head ? "head" : "rows"}`);
        return api;
      },
      eq(column: string, value: string) {
        calls.push(`${label}:eq:${column}:${value}`);
        return api;
      },
      order() {
        return api;
      },
      range() {
        return api;
      },
      is(column: string, _value: null) {
        calls.push(`${label}:is:${column}`);
        return api;
      },
      not() {
        return api;
      },
      then(onFulfilled: (value: InboxResult) => unknown, onRejected?: (reason: unknown) => unknown) {
        const result = responses[responseIndex] ?? responses[responses.length - 1];
        responseIndex += 1;
        return Promise.resolve(result).then(onFulfilled, onRejected);
      }
    };
    return api;
  };
  const supabase = {
    from(table: string) {
      calls.push(`from:${table}`);
      return builder("q0");
    }
  };
  return { supabase: supabase as never, calls };
}

const signedInUser = "836d59f2-60ef-460e-b413-c14bc8d3fa9a";
const otherUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function loaderChecks() {
  const empty = await loadUnansweredBroadcastQuestionNotice(inboxClient([]).supabase, "  ");
  assert.deepEqual(empty, { count: 0, questions: [] });

  const pending = inboxClient([
    {
      data: [
        {
          question_id: "b",
          created_at: "2026-10-25T11:00:00Z",
          first_responded_at: null,
          broadcast_questions: {
            id: "b",
            prompt: "האם זה נוח?",
            created_at: "2026-10-25T11:00:00Z",
            closed_at: null
          }
        }
      ],
      count: 1,
      error: null
    }
  ]);
  const notice = await loadUnansweredBroadcastQuestionNotice(pending.supabase, signedInUser);
  assert.equal(notice.count, 1);
  assert.equal(notice.questions[0]?.id, "b");
  assert.equal(notice.questions[0]?.answered, false);
  assert.equal(notice.questions[0]?.closed, false);
  assert.ok(pending.calls.includes(`q0:eq:user_id:${signedInUser}`));
  assert.equal(pending.calls.includes(`q0:eq:user_id:${otherUser}`), false);
  assert.ok(pending.calls.includes("q0:is:first_responded_at"));
  assert.ok(pending.calls.includes("q0:is:broadcast_questions.closed_at"));
  assert.ok(pending.calls.includes("from:broadcast_question_recipients"));

  const denied = inboxClient([
    {
      data: null,
      count: null,
      error: { code: "42501", message: "permission denied for table broadcast_question_recipients" }
    }
  ]);
  await assert.rejects(
    () => loadUnansweredBroadcastQuestionNotice(denied.supabase, otherUser),
    /permission denied/
  );
  assert.ok(denied.calls.includes(`q0:eq:user_id:${otherUser}`));
}

void loaderChecks()
  .then(() => {
    console.log("broadcast question visibility checks passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
