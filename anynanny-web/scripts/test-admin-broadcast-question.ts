import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BROADCAST_AUDIENCE_TYPES } from "../lib/admin/broadcast-audience";
import {
  BROADCAST_QUESTION_OPTION_MAX_COUNT,
  YES_NO_OPTIONS,
  broadcastQuestionConfirmMessage,
  canAddQuestionOption,
  canRemoveQuestionOption,
  validateBroadcastQuestion
} from "../lib/admin/broadcast-question-validation";

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

assert.match(broadcastQuestionConfirmMessage(4), /4/);

assert.match(route, /requireAdminApi/);
assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
assert.doesNotMatch(route, /body\.user_id|body\.test_user_id|body\.userId/);
assert.match(route, /signedInUserId/);
assert.match(route, /auth\.getUser/);
assert.match(previewSlice(), /countBroadcastRecipients/);
assert.doesNotMatch(previewSlice(), /sendAdminBroadcastQuestion/);
assert.match(route, /Missing idempotency key/);
assert.match(route, /isTest: true/);
assert.match(route, /testUserId: userId/);
assert.match(route, /isTest: false/);
assert.match(route, /testUserId: null/);
assert.doesNotMatch(route, /sendAdminBroadcast\(/);

assert.match(send, /import "server-only"/);
assert.match(send, /admin_send_broadcast_question/);
assert.match(send, /getSupabaseServiceRoleClient/);
assert.match(send, /p_test_user_id: input\.isTest \? testUserId : null/);
assert.doesNotMatch(send, /admin_send_in_app_broadcast/);

assert.match(form, /\/api\/admin\/broadcast\/question/);
assert.match(form, /תצוגה מקדימה/);
assert.match(form, /שליחת הודעת בדיקה לעצמי/);
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

console.log("admin broadcast question composer checks passed");
