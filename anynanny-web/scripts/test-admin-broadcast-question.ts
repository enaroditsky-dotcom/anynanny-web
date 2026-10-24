import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROADCAST_AUDIENCE_TYPES,
  DEFAULT_BROADCAST_AUDIENCE,
  audienceForLegacyQuestionRpc
} from "../lib/admin/broadcast-audience";
import {
  BROADCAST_QUESTION_OPTION_MAX_COUNT,
  YES_NO_OPTIONS,
  broadcastQuestionConfirmMessage,
  canAddQuestionOption,
  canRemoveQuestionOption,
  validateBroadcastQuestion
} from "../lib/admin/broadcast-question-validation";
import {
  parseSelectedPublicIdList,
  requireSelectedPublicIds
} from "../lib/admin/broadcast-selected-recipients";
import {
  ADMIN_BROADCAST_TEST_PUBLIC_ID,
  ADMIN_BROADCAST_TEST_UNAVAILABLE_MESSAGE,
  ADMIN_BROADCAST_TEST_USER_ID_ENV,
  BroadcastTestRecipientError,
  evaluateBroadcastTestAccount,
  isAuthBanActive,
  requireDedicatedBroadcastTestUserId,
  resolveAdminBroadcastTestRecipient,
  type BroadcastTestAccountSnapshot
} from "../lib/admin/broadcast-test-recipient";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const validation = read("lib/admin/broadcast-question-validation.ts");
const route = read("app/api/admin/broadcast/question/route.ts");
const send = read("lib/admin/broadcast-question-send.ts");
const form = read("components/admin/admin-broadcast-question-form.tsx");
const composer = read("components/admin/admin-broadcast-composer.tsx");
const page = read("app/admin/broadcast/page.tsx");
const regularRoute = read("app/api/admin/broadcast/route.ts");
const regularSend = read("lib/admin/broadcast-send.ts");
const regularForm = read("components/admin/admin-broadcast-form.tsx");
const recipient = read("lib/admin/broadcast-test-recipient.ts");
const recipientLoad = read("lib/admin/broadcast-test-recipient-load.ts");
const questionSql = read("supabase/migrations/20261019120000_broadcast_v2_questions.sql");

const yesNo = {
  audience: "parents" as const,
  prompt: "האם להמשיך?",
  questionFormat: "yes_no" as const,
  selectionMode: "single" as const,
  options: [...YES_NO_OPTIONS]
};

function previewSlice(): string {
  const start = route.indexOf('action === "preview"');
  const end = route.indexOf("Missing idempotency key");
  assert.ok(start >= 0 && end > start);
  return route.slice(start, end);
}

assert.match(validation, /isBroadcastAudienceType/);
assert.doesNotMatch(
  validation,
  /parent_onboarding_completed_at|marketing_consent|identity_verification_status|sitter_profiles/
);

for (const audience of BROADCAST_AUDIENCE_TYPES) {
  const parsed = validateBroadcastQuestion({ ...yesNo, audience });
  assert.equal(parsed.ok, true, audience);
  if (parsed.ok) assert.equal(parsed.value.audience, audience);
}

assert.equal(validateBroadcastQuestion({ ...yesNo, audience: "everyone" }).ok, false);

const missingPrompt = validateBroadcastQuestion({ ...yesNo, prompt: "  " });
assert.equal(missingPrompt.ok, false);
if (!missingPrompt.ok) assert.equal(missingPrompt.error, "נא להזין שאלה.");

const htmlPrompt = validateBroadcastQuestion({ ...yesNo, prompt: "<b>שאלה</b>" });
assert.equal(htmlPrompt.ok, false);
if (!htmlPrompt.ok) assert.match(htmlPrompt.error, /טקסט פשוט/);

const longPrompt = validateBroadcastQuestion({ ...yesNo, prompt: "א".repeat(2001) });
assert.equal(longPrompt.ok, false);

const yesNoMultiple = validateBroadcastQuestion({ ...yesNo, selectionMode: "multiple" });
assert.equal(yesNoMultiple.ok, false);
if (!yesNoMultiple.ok) assert.match(yesNoMultiple.error, /בחירה יחידה/);

const wrongYesNo = validateBroadcastQuestion({ ...yesNo, options: ["כן", "אולי"] });
assert.equal(wrongYesNo.ok, false);

const trimmedYesNo = validateBroadcastQuestion({ ...yesNo, options: ["  כן  ", "לא"] });
assert.equal(trimmedYesNo.ok, true);
if (trimmedYesNo.ok) assert.deepEqual(trimmedYesNo.value.options, ["כן", "לא"]);

const oneOption = validateBroadcastQuestion({
  ...yesNo,
  questionFormat: "custom",
  options: ["רק אחת"]
});
assert.equal(oneOption.ok, false);
if (!oneOption.ok) assert.match(oneOption.error, /2 ל-12/);

const tooMany = validateBroadcastQuestion({
  ...yesNo,
  questionFormat: "custom",
  options: Array.from({ length: BROADCAST_QUESTION_OPTION_MAX_COUNT + 1 }, (_, index) => `תשובה ${index}`)
});
assert.equal(tooMany.ok, false);

const duplicate = validateBroadcastQuestion({
  ...yesNo,
  questionFormat: "custom",
  options: ["בוקר", "  בוקר "]
});
assert.equal(duplicate.ok, false);
if (!duplicate.ok) assert.match(duplicate.error, /לחזור/);

const newline = validateBroadcastQuestion({
  ...yesNo,
  questionFormat: "custom",
  options: ["שורה\nשנייה", "אחרת"]
});
assert.equal(newline.ok, false);

const customMultiple = validateBroadcastQuestion({
  audience: "sitters",
  prompt: "מתי נוח?",
  questionFormat: "custom",
  selectionMode: "multiple",
  options: ["בוקר", "צהריים", "ערב"]
});
assert.equal(customMultiple.ok, true);
if (customMultiple.ok) {
  assert.equal(customMultiple.value.selectionMode, "multiple");
  assert.equal(customMultiple.value.options.length, 3);
  assert.equal(customMultiple.value.audienceLabel.length > 0, true);
}

assert.equal(canAddQuestionOption(2), true);
assert.equal(canAddQuestionOption(12), false);
assert.equal(canRemoveQuestionOption(2), false);
assert.equal(canRemoveQuestionOption(3), true);

const badKey = validateBroadcastQuestion({ ...yesNo, idempotencyKey: "has space" });
assert.equal(badKey.ok, false);
const goodKey = validateBroadcastQuestion({ ...yesNo, idempotencyKey: "test_abc-1" });
assert.equal(goodKey.ok, true);
if (goodKey.ok) assert.equal(goodKey.value.idempotencyKey, "test_abc-1");

assert.match(broadcastQuestionConfirmMessage("הורים בלבד", 4), /4/);
assert.match(broadcastQuestionConfirmMessage("הורים בלבד", 4), /הורים בלבד/);

function testActionSlice(): string {
  const start = route.indexOf('if (action === "test")');
  const end = route.indexOf("const selected = requireSelectedPublicIds", start);
  assert.ok(start >= 0 && end > start);
  return route.slice(start, end);
}

assert.match(route, /requireAdminApi/);
assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
assert.doesNotMatch(route, /body\.user_id|body\.test_user_id|body\.userId/);
assert.doesNotMatch(route, /signedInUserId|createServerClient|auth\.getUser/);
assert.match(route, /resolveConfiguredBroadcastTestRecipient/);
assert.match(route, /requireDedicatedBroadcastTestUserId/);
assert.equal(ADMIN_BROADCAST_TEST_UNAVAILABLE_MESSAGE, "חשבון הבדיקה P-1002 אינו זמין.");
assert.match(route, /ADMIN_BROADCAST_TEST_UNAVAILABLE_MESSAGE/);
assert.match(previewSlice(), /countBroadcastRecipients/);
assert.doesNotMatch(previewSlice(), /sendAdminBroadcastQuestion/);
assert.match(route, /Missing idempotency key/);
assert.match(testActionSlice(), /isTest: true/);
assert.match(testActionSlice(), /testUserId/);
assert.doesNotMatch(testActionSlice(), /signedInUserId|all_users|admin_broadcast_recipient_ids|countBroadcastRecipients|public_ids|sendSelected/);
assert.match(route, /isTest: false/);
assert.match(route, /testUserId: null/);
assert.doesNotMatch(route, /sendAdminBroadcast\(/);
assert.doesNotMatch(route.slice(route.indexOf("isTest: false")), /resolveConfiguredBroadcastTestRecipient/);

assert.match(send, /import "server-only"/);
assert.match(send, /admin_send_broadcast_question/);
assert.match(send, /getSupabaseServiceRoleClient/);
assert.match(send, /p_test_user_id: input\.isTest \? testUserId : null/);
assert.match(send, /audienceForLegacyQuestionRpc/);
assert.match(send, /p_is_test: input\.isTest/);
assert.match(send, /p_idempotency_key: input\.message\.idempotencyKey/);
assert.doesNotMatch(send, /admin_send_in_app_broadcast/);

function legacyQuestionSendSlice(): string {
  const start = send.indexOf("export async function sendAdminBroadcastQuestion");
  const end = send.indexOf("export async function previewSelectedBroadcastQuestionRecipients");
  assert.ok(start >= 0 && end > start);
  return send.slice(start, end);
}

function selectedQuestionSendSlice(): string {
  const start = send.indexOf("export async function sendSelectedAdminBroadcastQuestion");
  assert.ok(start >= 0);
  return send.slice(start);
}

assert.match(legacyQuestionSendSlice(), /audienceForLegacyQuestionRpc/);
assert.doesNotMatch(legacyQuestionSendSlice(), /p_public_ids|admin_send_selected_broadcast_question/);
assert.doesNotMatch(selectedQuestionSendSlice(), /audienceForLegacyQuestionRpc|p_is_test|p_test_user_id|all_users/);
assert.match(selectedQuestionSendSlice(), /p_public_ids: input\.publicIds/);

for (const audience of BROADCAST_AUDIENCE_TYPES) {
  assert.equal(
    audienceForLegacyQuestionRpc({ audience, isTest: true }),
    DEFAULT_BROADCAST_AUDIENCE,
    audience
  );
  assert.equal(audienceForLegacyQuestionRpc({ audience, isTest: false }), audience, audience);
}
assert.equal(DEFAULT_BROADCAST_AUDIENCE, "all_users");

const ignoredLists = [
  undefined,
  "",
  "   ",
  "not-an-id",
  "P-1002, P-1002",
  Array.from({ length: 51 }, (_, index) => `P-${index + 1}`)
];
for (const raw of ignoredLists) {
  const parsed = requireSelectedPublicIds("selected_public_ids", raw);
  assert.equal(parsed.ok, false);
  assert.equal(
    audienceForLegacyQuestionRpc({ audience: "selected_public_ids", isTest: true }),
    "all_users"
  );
}
assert.equal(parseSelectedPublicIdList("").ok, false);
assert.equal(parseSelectedPublicIdList("RP-1, nope").ok, false);

function handleTestSlice(): string {
  const start = form.indexOf("const handleTest");
  const end = form.indexOf("const handleSend");
  assert.ok(start >= 0 && end > start);
  return form.slice(start, end);
}

assert.doesNotMatch(handleTestSlice(), /public_ids|selectedRequest|selectedIds|sendSelected/);

assert.match(form, /\/api\/admin\/broadcast\/question/);
assert.match(form, /תצוגה מקדימה/);
assert.match(form, /שליחת בדיקה לחשבון P-1002/);
assert.match(form, /שאלת הבדיקה נשלחה רק לחשבון P-1002/);
assert.doesNotMatch(form, /שליחת הודעת בדיקה לעצמי|משתמש המחובר/);
assert.match(form, /שליחה לנמענים/);
assert.match(form, /\+ הוסף תשובה/);
assert.match(form, /כן \/ לא/);
assert.match(form, /תשובות לבחירה/);
assert.match(form, /sendingLockRef/);
assert.match(form, /idempotency_key/);
assert.match(form, /BROADCAST_AUDIENCE_TYPES/);
assert.doesNotMatch(form, /service_role|user_id|SUPABASE_SERVICE_ROLE_KEY/);

assert.match(composer, /Broadcast רגיל/);
assert.match(composer, /Broadcast — שאלה אמריקאית/);
assert.match(composer, /AdminBroadcastForm/);
assert.match(composer, /AdminBroadcastQuestionForm/);
assert.match(composer, /hidden/);
assert.match(page, /AdminBroadcastComposer/);
assert.match(page, /שליחת הודעת Broadcast/);

assert.match(regularForm, /fetch\("\/api\/admin\/broadcast"/);
assert.doesNotMatch(regularForm, /\/api\/admin\/broadcast\/question/);
assert.match(regularRoute, /sendAdminBroadcast/);
assert.doesNotMatch(regularRoute, /sendAdminBroadcastQuestion|admin_send_broadcast_question/);
assert.match(regularSend, /admin_send_in_app_broadcast/);
assert.doesNotMatch(regularSend, /admin_send_broadcast_question/);
assert.match(regularRoute, /signedInUserId/);
assert.match(regularForm, /שליחת הודעת בדיקה לעצמי/);
assert.doesNotMatch(regularForm, /שליחת בדיקה לחשבון P-1002/);

assert.match(recipient, /ADMIN_BROADCAST_TEST_USER_ID/);
assert.match(recipient, /P-1002/);
assert.doesNotMatch(recipient, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
assert.match(recipientLoad, /import "server-only"/);
assert.match(recipientLoad, /\.eq\("id", userId\)/);
assert.match(recipientLoad, /parent_serial/);
assert.match(recipientLoad, /auth\.admin\.getUserById\(userId\)/);
assert.doesNotMatch(recipientLoad, /\.eq\("parent_serial"|all_users|admin_broadcast_recipient_ids|signedInUserId|email/);
assert.match(
  questionSql,
  /if v_is_test then\s+insert into public\.broadcast_question_recipients \(question_id, user_id\)\s+values \(v_question_id, p_test_user_id\);/
);
assert.match(
  questionSql,
  /else\s+insert into public\.broadcast_question_recipients \(question_id, user_id\)\s+select distinct v_question_id, r\.user_id\s+from public\.admin_broadcast_recipient_ids\(p_audience\) r/
);

const configuredId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

function activeAccount(overrides: Partial<BroadcastTestAccountSnapshot> = {}): BroadcastTestAccountSnapshot {
  return {
    profileFound: true,
    role: "parent",
    parentSerial: ADMIN_BROADCAST_TEST_PUBLIC_ID,
    suspended: false,
    authFound: true,
    banned: false,
    deleted: false,
    ...overrides
  };
}

assert.equal(isAuthBanActive(null, new Date("2026-10-23T00:00:00Z")), false);
assert.equal(isAuthBanActive("not-a-date", new Date("2026-10-23T00:00:00Z")), true);
assert.equal(isAuthBanActive("2026-10-22T00:00:00Z", new Date("2026-10-23T00:00:00Z")), false);
assert.equal(isAuthBanActive("2026-10-24T00:00:00Z", new Date("2026-10-23T00:00:00Z")), true);
assert.equal(evaluateBroadcastTestAccount(activeAccount()), "ok");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ parentSerial: "p-1002" })), "ok");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ parentSerial: " P-1002 " })), "ok");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ parentSerial: "1002" })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ parentSerial: "P_1002" })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ profileFound: false })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ authFound: false })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ role: "sitter" })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ parentSerial: "P-1003" })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ parentSerial: "RP-1002" })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ suspended: true })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ banned: true })), "invalid");
assert.equal(evaluateBroadcastTestAccount(activeAccount({ deleted: true })), "invalid");
assert.throws(() => requireDedicatedBroadcastTestUserId(ADMIN_BROADCAST_TEST_PUBLIC_ID), BroadcastTestRecipientError);
assert.equal(requireDedicatedBroadcastTestUserId(configuredId.toUpperCase()), configuredId);

async function rejectedSend(env: Record<string, string | undefined>, snapshot?: BroadcastTestAccountSnapshot) {
  let sent = false;
  let loaded = 0;
  await assert.rejects(
    async () => {
      const userId = await resolveAdminBroadcastTestRecipient({
        env,
        load: async (seen) => {
          loaded += 1;
          assert.equal(seen, configuredId);
          return snapshot ?? activeAccount({ profileFound: false });
        }
      });
      const testUserId = requireDedicatedBroadcastTestUserId(userId);
      sent = true;
      return { isTest: true as const, testUserId, audienceExpanded: false };
    },
    (error: unknown) => error instanceof BroadcastTestRecipientError
  );
  assert.equal(sent, false);
  return loaded;
}

async function runRecipientChecks(): Promise<void> {
  assert.equal(await rejectedSend({}), 0);
  assert.equal(await rejectedSend({ [ADMIN_BROADCAST_TEST_USER_ID_ENV]: "  " }), 0);
  assert.equal(await rejectedSend({ [ADMIN_BROADCAST_TEST_USER_ID_ENV]: ADMIN_BROADCAST_TEST_PUBLIC_ID }), 0);
  assert.equal(await rejectedSend({ [ADMIN_BROADCAST_TEST_USER_ID_ENV]: "not-a-uuid" }), 0);
  assert.equal(
    await rejectedSend({ [ADMIN_BROADCAST_TEST_USER_ID_ENV]: configuredId }, activeAccount({ profileFound: false })),
    1
  );
  assert.equal(
    await rejectedSend({ [ADMIN_BROADCAST_TEST_USER_ID_ENV]: configuredId }, activeAccount({ authFound: false })),
    1
  );
  assert.equal(
    await rejectedSend({ [ADMIN_BROADCAST_TEST_USER_ID_ENV]: configuredId }, activeAccount({ parentSerial: "P-1001" })),
    1
  );
  assert.equal(
    await rejectedSend({ [ADMIN_BROADCAST_TEST_USER_ID_ENV]: configuredId }, activeAccount({ role: "sitter" })),
    1
  );

  const seen: string[] = [];
  const resolved = await resolveAdminBroadcastTestRecipient({
    env: {
      [ADMIN_BROADCAST_TEST_USER_ID_ENV]: `  ${configuredId.toUpperCase()}  `,
      browser_user_id: otherId
    },
    load: async (userId) => {
      seen.push(userId);
      return activeAccount();
    }
  });
  const delivery = {
    isTest: true as const,
    testUserId: requireDedicatedBroadcastTestUserId(resolved),
    audienceExpanded: false
  };
  assert.deepEqual(seen, [configuredId]);
  assert.equal(delivery.testUserId, configuredId);
  assert.equal(delivery.isTest, true);
  assert.equal(delivery.audienceExpanded, false);
  assert.notEqual(delivery.testUserId, otherId);

  const allUsers = validateBroadcastQuestion({
    ...yesNo,
    audience: "all_users",
    idempotencyKey: "test_fixed_recipient"
  });
  assert.equal(allUsers.ok, true);
  if (allUsers.ok) {
    assert.equal(allUsers.value.audience, "all_users");
    assert.equal(delivery.testUserId, configuredId);
  }
}

runRecipientChecks()
  .then(() => {
    console.log("admin broadcast question composer checks passed");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
