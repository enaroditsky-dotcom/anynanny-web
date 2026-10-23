import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminRoleLabel,
  formatPercent,
  pageBounds,
  respondentPageFromQuery,
  parseAudienceFilter,
  parseQuestionResultScope,
  parseRespondentStatus,
  publicIdSearchTerm,
  summarizeQuestionResults
} from "../lib/admin/broadcast-question-results";
import { pickProfilePublicId } from "../lib/public/sequential-display-id";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const listRoute = read("app/api/admin/broadcast/questions/route.ts");
const detailRoute = read("app/api/admin/broadcast/questions/[id]/route.ts");
const closeRoute = read("app/api/admin/broadcast/questions/[id]/close/route.ts");
const loader = read("lib/admin/broadcast-question-results-load.ts");
const ui = read("components/admin/admin-broadcast-question-results.tsx");
const page = read("app/admin/broadcast/page.tsx");
const composer = read("components/admin/admin-broadcast-composer.tsx");
const regularRoute = read("app/api/admin/broadcast/route.ts");
const regularSend = read("lib/admin/broadcast-send.ts");

function afterExport(source: string): string {
  const start = source.indexOf("export async function");
  assert.ok(start > 0);
  return source.slice(start);
}

const campaign = summarizeQuestionResults({
  recipientCount: 10,
  respondentCount: 3,
  selectionMode: "single",
  options: [
    { id: "a", label: "כן", position: 1, selections: 2 },
    { id: "b", label: "לא", position: 2, selections: 1 }
  ]
});
assert.equal(campaign.recipients, 10);
assert.equal(campaign.respondents, 3);
assert.equal(campaign.nonrespondents, 7);
assert.equal(campaign.responseRate, 30);
assert.equal(campaign.percentagesMayExceed100, false);
assert.equal(campaign.options[0]?.percentOfRespondents, 66.7);
assert.equal(campaign.options[1]?.percentOfRespondents, 33.3);
assert.equal(formatPercent(campaign.responseRate), "30%");

const edited = summarizeQuestionResults({
  recipientCount: 4,
  respondentCount: 2,
  selectionMode: "multiple",
  options: [
    { id: "morning", label: "בוקר", position: 1, selections: 1 },
    { id: "noon", label: "צהריים", position: 2, selections: 2 },
    { id: "evening", label: "ערב", position: 3, selections: 0 }
  ]
});
assert.equal(edited.respondents, 2);
assert.equal(edited.nonrespondents, 2);
assert.equal(edited.responseRate, 50);
assert.equal(edited.options.map((option) => option.selections).reduce((sum, count) => sum + count, 0), 3);
assert.deepEqual(
  edited.options.map((option) => option.percentOfRespondents),
  [50, 100, 0]
);
assert.equal(edited.percentagesMayExceed100, true);
assert.ok(edited.options.reduce((sum, option) => sum + option.percentOfRespondents, 0) > 100);

assert.equal(parseQuestionResultScope("test"), "test");
assert.equal(parseQuestionResultScope("real"), "real");
assert.equal(parseQuestionResultScope("anything"), "real");
assert.equal(parseAudienceFilter("parents"), "parents");
assert.equal(parseAudienceFilter("everyone"), null);
assert.equal(parseRespondentStatus("not_responded"), "not_responded");
assert.equal(parseRespondentStatus("maybe"), "all");
assert.deepEqual(pageBounds(2, 25), { page: 2, from: 25, to: 49 });

const firstPage = respondentPageFromQuery({
  data: [{ id: "rp" }, { id: "ran" }],
  count: 2,
  error: null,
  totalWhenUnsatisfiable: 0
});
assert.deepEqual(firstPage, { rows: [{ id: "rp" }, { id: "ran" }], total: 2, error: null });

const secondPage = respondentPageFromQuery({
  data: null,
  count: null,
  error: { code: "PGRST103", message: "Requested range not satisfiable" },
  totalWhenUnsatisfiable: 2
});
assert.deepEqual(secondPage, { rows: [], total: 2, error: null });

const emptyPage = respondentPageFromQuery({
  data: [],
  count: 0,
  error: null,
  totalWhenUnsatisfiable: 2
});
assert.deepEqual(emptyPage, { rows: [], total: 0, error: null });

const filteredPastEnd = respondentPageFromQuery({
  data: null,
  count: null,
  error: { message: "Requested range not satisfiable" },
  totalWhenUnsatisfiable: 1
});
assert.deepEqual(filteredPastEnd, { rows: [], total: 1, error: null });

const laterPage = respondentPageFromQuery({
  data: [{ id: "row-26" }, { id: "row-27" }],
  count: 30,
  error: null,
  totalWhenUnsatisfiable: 0
});
assert.deepEqual(laterPage, { rows: [{ id: "row-26" }, { id: "row-27" }], total: 30, error: null });

const unrelated = respondentPageFromQuery({
  data: null,
  count: null,
  error: { code: "42501", message: "permission denied" },
  totalWhenUnsatisfiable: 2
});
assert.equal(unrelated.error, "permission denied");
assert.deepEqual(unrelated.rows, []);

const historyFirst = respondentPageFromQuery({
  data: [
    { id: "f1343680-1559-4ee0-842e-118a5d38c834" },
    { id: "bafaced0-0587-44ae-9c85-dd17d6c8cb12" }
  ],
  count: 2,
  error: null,
  totalWhenUnsatisfiable: 0
});
assert.equal(historyFirst.rows.length, 2);
assert.equal(historyFirst.total, 2);
assert.equal(historyFirst.error, null);

const historyPastEnd = respondentPageFromQuery({
  data: null,
  count: null,
  error: { code: "PGRST103", message: "Requested range not satisfiable" },
  totalWhenUnsatisfiable: 2
});
assert.deepEqual(historyPastEnd, { rows: [], total: 2, error: null });

const historyEmpty = respondentPageFromQuery({
  data: [],
  count: 0,
  error: null,
  totalWhenUnsatisfiable: 0
});
assert.deepEqual(historyEmpty, { rows: [], total: 0, error: null });

const historyFilteredPastEnd = respondentPageFromQuery({
  data: null,
  count: null,
  error: { message: "Requested range not satisfiable" },
  totalWhenUnsatisfiable: 1
});
assert.deepEqual(historyFilteredPastEnd, { rows: [], total: 1, error: null });

const historyLaterPage = respondentPageFromQuery({
  data: [{ id: "question-21" }],
  count: 21,
  error: null,
  totalWhenUnsatisfiable: 0
});
assert.deepEqual(historyLaterPage, { rows: [{ id: "question-21" }], total: 21, error: null });

const historyDenied = respondentPageFromQuery({
  data: null,
  count: null,
  error: { code: "42501", message: "permission denied" },
  totalWhenUnsatisfiable: 2
});
assert.equal(historyDenied.error, "permission denied");
assert.deepEqual(historyDenied.rows, []);
assert.deepEqual(pageBounds(2, 20), { page: 2, from: 20, to: 39 });
assert.equal(pageBounds("0", 25).page, 1);
assert.equal(publicIdSearchTerm(" RP-1001 "), "RP-1001");
assert.equal(publicIdSearchTerm("%"), null);
assert.equal(publicIdSearchTerm("R"), null);

assert.equal(pickProfilePublicId({ parent_serial: "rp-1001" }, "parent"), "RP-1001");
assert.equal(pickProfilePublicId({ parent_serial: "P-1002" }, "parent"), "P-1002");
assert.equal(pickProfilePublicId({ nanny_serial: "ran-1004" }, "sitter"), "RAN-1004");
assert.equal(pickProfilePublicId({ nanny_serial: "AN-8" }, "sitter"), "AN-8");
assert.equal(pickProfilePublicId({ nanny_serial: "CONS-3" }, "sitter"), "CONS-3");
assert.equal(pickProfilePublicId({ parent_serial: "user@example.com" }, "parent"), null);
assert.equal(adminRoleLabel("parent"), "הורה");
assert.equal(adminRoleLabel("sitter"), "נני");
assert.equal(adminRoleLabel("admin"), "לא ידוע");

for (const source of [afterExport(listRoute), afterExport(detailRoute), afterExport(closeRoute)]) {
  assert.ok(source.indexOf("requireAdminApi") < source.search(/listBroadcastQuestionHistory|loadBroadcastQuestionResult|closeBroadcastQuestion/));
}
assert.match(listRoute, /scope/);
assert.match(loader, /\.eq\("is_test", input\.scope === "test"\)/);
assert.match(loader, /broadcast_question_recipients/);
assert.match(loader, /first_responded_at/);
assert.match(loader, /pickProfilePublicId\(\{ parent_serial: profile\?\.parent_serial \}, "parent"\)/);
assert.match(loader, /pickProfilePublicId\(\{ nanny_serial: profile\?\.nanny_serial \}, "sitter"\)/);
assert.doesNotMatch(loader, /admin_broadcast_recipient_ids|email|phone/);
assert.match(loader, /admin_close_broadcast_question/);
assert.match(loader, /range\(bounds\.from, bounds\.to\)/);
assert.match(loader, /respondentPageFromQuery/);
assert.match(loader, /isUnsatisfiableRangeError\(error\)/);
assert.match(loader, /countRecipientPage/);
const historySource = loader.slice(
  loader.indexOf("export async function listBroadcastQuestionHistory"),
  loader.indexOf("async function loadQuestion")
);
assert.match(historySource, /respondentPageFromQuery/);
assert.match(historySource, /countBroadcastQuestionHistory/);
assert.match(historySource, /\.eq\("is_test", input\.scope === "test"\)/);
assert.match(historySource, /\.order\("created_at", \{ ascending: false \}\)/);
assert.match(historySource, /if \(input\.audience\) query = query\.eq\("audience_type", input\.audience\)/);
assert.doesNotMatch(loader, /\.limit\(50\)/);
assert.match(loader, /pageOfIds/);
assert.doesNotMatch(loader, /delete\(|insert into public\.notifications|\.insert\(/);
assert.match(closeRoute, /already_closed/);
assert.doesNotMatch(closeRoute, /admin_send_broadcast_question|notifications/);

assert.match(ui, /שאלות אמיתיות/);
assert.match(ui, /שאלות בדיקה/);
assert.match(ui, /תוצאות מפורטות/);
assert.match(ui, /סגירת שאלה/);
assert.match(ui, /window\.confirm/);
assert.match(ui, /מזהה הורה/);
assert.match(ui, /מזהה נני/);
assert.match(ui, /לא ענו/);
assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY|getSupabaseServiceRoleClient/);
assert.match(page, /AdminBroadcastComposer/);
assert.match(page, /AdminBroadcastQuestionResults/);
assert.match(composer, /AdminBroadcastForm/);
assert.match(regularRoute, /sendAdminBroadcast/);
assert.doesNotMatch(regularRoute, /broadcast-question-results|admin_close_broadcast_question/);
assert.match(regularSend, /admin_send_in_app_broadcast/);
assert.doesNotMatch(regularSend, /admin_send_broadcast_question|admin_close_broadcast_question/);

console.log("broadcast question results checks passed");
