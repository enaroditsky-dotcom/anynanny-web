import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exactPublicId, pageOfIds, profileSerialMatches } from "../lib/admin/broadcast-question-results";
import {
  listMyBroadcastQuestions,
  matchesMyQuestionFilter,
  MY_QUESTIONS_PAGE_SIZE,
  parseMyQuestionStatus
} from "../lib/broadcast/question-inbox";
import { broadcastQuestionDismissPersistsRead } from "../lib/broadcast/question-link";
import {
  classifyQuestionNotifications,
  ordinaryAdminBroadcastsForReplay
} from "../lib/broadcast/question-replay";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function payload(questionId?: string) {
  return questionId ? { question_id: questionId } : { cta_route: "/parent/dashboard" };
}

const questions = Array.from({ length: 6 }, (_, index) => ({
  id: `q${index}`,
  payload: payload(`11111111-1111-4111-8111-11111111111${index}`)
}));
const ordinary = [
  { id: "b1", payload: payload() },
  { id: "b2", payload: payload() }
];
const replay = ordinaryAdminBroadcastsForReplay([...questions, ...ordinary, { id: "b3", payload: payload() }]);
assert.deepEqual(
  replay.map((row) => row.id),
  ["b1", "b2", "b3"]
);
assert.equal(replay.length <= 5, true);
assert.equal(replay.some((row) => "question_id" in row.payload), false);

const lookupFailed = classifyQuestionNotifications(questions, { ok: false, error: "unavailable" });
assert.equal(lookupFailed.answered.length, 0);
assert.equal(lookupFailed.unanswered.length, 0);
assert.equal(lookupFailed.unknown.length, 6);

const firstId = questions[0]?.payload.question_id ?? "";
const lookupOk = classifyQuestionNotifications(questions, { ok: true, answeredIds: new Set([String(firstId)]) });
assert.equal(lookupOk.unknown.length, 0);
assert.equal(lookupOk.answered.length, 1);
assert.equal(lookupOk.unanswered.length, 5);
assert.equal(broadcastQuestionDismissPersistsRead(questions[0]?.payload), false);

assert.equal(matchesMyQuestionFilter({ answered: false, closed: false }, "pending"), true);
assert.equal(matchesMyQuestionFilter({ answered: true, closed: false }, "pending"), false);
assert.equal(matchesMyQuestionFilter({ answered: true, closed: false }, "answered"), true);
assert.equal(matchesMyQuestionFilter({ answered: true, closed: true }, "answered"), true);
assert.equal(matchesMyQuestionFilter({ answered: false, closed: true }, "closed"), true);
assert.equal(matchesMyQuestionFilter({ answered: false, closed: true }, "pending"), false);
assert.equal(parseMyQuestionStatus("nope"), "pending");

assert.equal(profileSerialMatches("RP-1001", null, "RP"), true);
assert.equal(profileSerialMatches("P-1001", null, "RP"), false);
assert.equal(profileSerialMatches(null, "RAN-1004", "RAN"), true);
assert.equal(profileSerialMatches(null, "AN-1004", "RAN"), false);
assert.equal(profileSerialMatches("RP-1001", "RAN-1004", "RP-1001"), true);
assert.deepEqual(exactPublicId("rp-1001"), { column: "parent_serial", value: "RP-1001" });
assert.deepEqual(exactPublicId("ran-1004"), { column: "nanny_serial", value: "RAN-1004" });
assert.equal(exactPublicId("RP"), null);
assert.equal(exactPublicId("RAN"), null);
const thirty = Array.from({ length: 30 }, (_, index) => `user-${index}`);
const secondPage = pageOfIds(thirty, 2, 25);
assert.equal(secondPage.total, 30);
assert.equal(secondPage.ids.length, 5);
assert.equal(secondPage.ids[0], "user-25");

const coordination = read("lib/notifications/coordination.ts");
const cards = read("components/notifications/global-coordination-notifications.tsx");
const answer = read("components/broadcast/broadcast-question-answer.tsx");
const loader = read("lib/admin/broadcast-question-results-load.ts");
const questionRoute = read("app/api/admin/broadcast/question/route.ts");
const regularRoute = read("app/api/admin/broadcast/route.ts");
const regularSend = read("lib/admin/broadcast-send.ts");
const inboxRoute = read("app/api/broadcast/questions/route.ts");
const inboxPage = read("components/broadcast/my-broadcast-questions.tsx");
const parentSettings = read("app/parent/settings/page.tsx");
const sitterSettings = read("app/sitter/settings/page.tsx");

assert.match(coordination, /payload->>question_id/);
assert.match(coordination, /ordinaryAdminBroadcastsForReplay/);
assert.match(coordination, /questionStatusError/);
assert.match(coordination, /omitAnsweredBroadcastQuestions/);
assert.match(coordination, /broadcastQuestionIdFromPayload\(row\.payload\)/);
assert.match(cards, /questionLookupError/);
assert.match(cards, /השאלות שלי/);
assert.match(cards, /נסו שוב/);
assert.match(answer, /user\?\.id/);
assert.match(answer, /loadedForUserId === userId/);
assert.match(answer, /setSelected\(\[\]\)/);
assert.doesNotMatch(loader, /\.limit\(50\)/);
assert.match(loader, /profileSerialMatches/);
assert.match(loader, /pageOfIds/);
assert.match(loader, /RECIPIENT_SCAN_PAGE/);
assert.doesNotMatch(questionRoute, /error\.message/);
assert.match(questionRoute, /לא הצלחנו לשלוח את השאלה/);
assert.match(questionRoute, /לא הצלחנו לחשב את מספר הנמענים/);
assert.match(questionRoute, /console\.error/);
assert.match(regularRoute, /sendAdminBroadcast/);
assert.doesNotMatch(regularRoute, /admin_send_broadcast_question/);
assert.match(regularSend, /admin_send_in_app_broadcast/);
assert.doesNotMatch(regularSend, /admin_send_broadcast_question/);
assert.match(inboxRoute, /auth\.getUser/);
assert.match(inboxRoute, /userId: user\.id/);
assert.match(read("lib/broadcast/question-inbox.ts"), /\.eq\("user_id", userId\)/);
assert.match(coordination, /לא הצלחנו לבדוק אם השאלה כבר נענתה/);
assert.doesNotMatch(inboxRoute, /getSupabaseServiceRoleClient|SUPABASE_SERVICE_ROLE/);
assert.match(inboxRoute, /listMyBroadcastQuestions/);
assert.match(inboxPage, /השאלות שלי/);
assert.match(inboxPage, /loadedForUserId === userId/);
assert.match(inboxPage, /ממתינות/);
assert.match(inboxPage, /שנענו/);
assert.match(inboxPage, /סגורות/);
assert.match(parentSettings, /MyQuestionsSettingsLink/);
assert.match(sitterSettings, /MyQuestionsSettingsLink/);

const inboxSource = read("lib/broadcast/question-inbox.ts");
assert.match(inboxSource, /respondentPageFromQuery/);
assert.match(inboxSource, /isUnsatisfiableRangeError/);
assert.match(inboxSource, /order\("created_at", \{ ascending: false \}\)/);
assert.doesNotMatch(inboxSource, /broadcast-question-results-load/);
assert.equal(MY_QUESTIONS_PAGE_SIZE, 20);

async function inboxPagination() {
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
      order(column: string, options: { ascending: boolean }) {
        calls.push(`${label}:order:${column}:${String(options.ascending)}`);
        return api;
      },
      range(from: number, to: number) {
        calls.push(`${label}:range:${from}:${to}`);
        return api;
      },
      is(column: string, _value: null) {
        calls.push(`${label}:is:${column}`);
        return api;
      },
      not(column: string, operator: string, _value: null) {
        calls.push(`${label}:not:${column}:${operator}`);
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
      const label = `q${calls.filter((call) => call.startsWith("from:")).length}`;
      calls.push(`from:${table}`);
      return builder(label);
    }
  };
  return { supabase: supabase as never, calls };
}

function questionRow(
  id: string,
  prompt: string,
  createdAt: string,
  extras: { answered?: string | null; closed?: string | null } = {}
) {
  return {
    question_id: id,
    created_at: createdAt,
    first_responded_at: extras.answered ?? null,
    broadcast_questions: {
      id,
      prompt,
      created_at: createdAt,
      closed_at: extras.closed ?? null
    }
  };
}

const inboxUserId = "836d59f2-60ef-460e-b413-c14bc8d3fa9a";
const newerId = "f1343680-1559-4ee0-842e-118a5d38c834";
const olderId = "bafaced0-0587-44ae-9c85-dd17d6c8cb12";

const first = inboxClient([
  {
    data: [
      questionRow(newerId, "האם הייתם משתמשים בשירות AnyNanny NOW?", "2026-10-20T12:00:00Z"),
      questionRow(olderId, "האם הייתם משתמשים בשירות", "2026-10-20T11:00:00Z")
    ],
    count: 2,
    error: null
  }
]);
const firstPage = await listMyBroadcastQuestions(first.supabase, {
  userId: inboxUserId,
  status: "pending",
  page: 1
});
assert.equal(firstPage.page, 1);
assert.equal(firstPage.pageSize, 20);
assert.equal(firstPage.total, 2);
assert.deepEqual(
  firstPage.questions.map((row) => row.id),
  [newerId, olderId]
);
assert.equal(firstPage.questions[0]?.answered, false);
assert.equal(firstPage.questions[0]?.closed, false);
assert.ok(first.calls.includes(`q0:eq:user_id:${inboxUserId}`));
assert.ok(first.calls.includes("q0:order:created_at:false"));
assert.ok(first.calls.includes("q0:range:0:19"));
assert.ok(first.calls.includes("q0:is:first_responded_at"));
assert.ok(first.calls.includes("q0:is:broadcast_questions.closed_at"));
assert.equal(first.calls.filter((call) => call.startsWith("from:")).length, 1);

const pastEnd = inboxClient([
  { data: null, count: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } },
  { data: null, count: 2, error: null }
]);
const pastEndPage = await listMyBroadcastQuestions(pastEnd.supabase, {
  userId: inboxUserId,
  status: "pending",
  page: 2
});
assert.deepEqual(pastEndPage.questions, []);
assert.equal(pastEndPage.page, 2);
assert.equal(pastEndPage.total, 2);
assert.ok(pastEnd.calls.includes("q0:range:20:39"));
assert.ok(pastEnd.calls.includes("q1:select:head"));
assert.ok(pastEnd.calls.includes(`q1:eq:user_id:${inboxUserId}`));
assert.equal(pastEnd.calls.some((call) => call.startsWith("q1:range:")), false);

const emptyCategory = inboxClient([{ data: [], count: 0, error: null }]);
const emptyPage = await listMyBroadcastQuestions(emptyCategory.supabase, {
  userId: inboxUserId,
  status: "closed",
  page: 1
});
assert.deepEqual(emptyPage.questions, []);
assert.equal(emptyPage.total, 0);
assert.ok(emptyCategory.calls.includes("q0:not:broadcast_questions.closed_at:is"));
assert.equal(emptyCategory.calls.filter((call) => call.startsWith("from:")).length, 1);

const fewerPages = inboxClient([
  { data: null, count: null, error: { message: "Requested range not satisfiable" } },
  { data: null, count: 1, error: null }
]);
const fewerPage = await listMyBroadcastQuestions(fewerPages.supabase, {
  userId: inboxUserId,
  status: "answered",
  page: 2
});
assert.deepEqual(fewerPage.questions, []);
assert.equal(fewerPage.total, 1);
assert.ok(fewerPages.calls.includes("q0:not:first_responded_at:is"));
assert.ok(fewerPages.calls.includes("q1:not:first_responded_at:is"));
assert.equal(
  fewerPages.calls.some((call) => call.includes("closed_at")),
  false
);

const later = inboxClient([
  {
    data: [
      questionRow("later-question", "עמוד שני", "2026-10-20T09:00:00Z", {
        answered: "2026-10-20T09:05:00Z"
      })
    ],
    count: 21,
    error: null
  }
]);
const laterPage = await listMyBroadcastQuestions(later.supabase, {
  userId: inboxUserId,
  status: "answered",
  page: 2
});
assert.equal(laterPage.total, 21);
assert.equal(laterPage.questions.length, 1);
assert.equal(laterPage.questions[0]?.answered, true);
assert.equal(laterPage.questions[0]?.closed, false);
assert.ok(later.calls.includes("q0:range:20:39"));
assert.equal(later.calls.filter((call) => call.startsWith("from:")).length, 1);

const denied = inboxClient([
  {
    data: null,
    count: null,
    error: { code: "42501", message: "permission denied for table broadcast_question_recipients" }
  }
]);
await assert.rejects(
  () => listMyBroadcastQuestions(denied.supabase, { userId: inboxUserId, status: "pending", page: 1 }),
  /permission denied for table broadcast_question_recipients/
);
assert.equal(denied.calls.filter((call) => call.startsWith("from:")).length, 1);
}

void inboxPagination()
  .then(() => {
    console.log("broadcast question inbox checks passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
