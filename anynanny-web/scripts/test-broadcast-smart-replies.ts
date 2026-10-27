import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  BROADCAST_SMART_REPLY_DEFAULT,
  BROADCAST_SMART_REPLY_MAX_LENGTH,
  validateBroadcastQuestion
} from "../lib/admin/broadcast-question-validation";
import { isThumbsUpNannyPayload, nannyTalkImageSrc, NANNY_IMAGE_SRC, NANNY_THUMBS_UP_IMAGE_SRC } from "../lib/broadcast/system-talks";
import { isServerSmartReplyNotification, SMART_REPLY_PUSH_DEDUPE_PREFIX } from "../lib/push/deliver-notification";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const v2Sql = readFileSync(resolve(root, "supabase/migrations/20261019120000_broadcast_v2_questions.sql"), "utf8");
const smartSql = readFileSync(resolve(root, "supabase/migrations/20261027153000_broadcast_question_smart_replies.sql"), "utf8");
const form = readFileSync(resolve(root, "components/admin/admin-broadcast-question-form.tsx"), "utf8");
const fields = readFileSync(resolve(root, "components/admin/admin-broadcast-smart-reply-fields.tsx"), "utf8");
const overlay = readFileSync(resolve(root, "components/notifications/global-coordination-notifications.tsx"), "utf8");

const ADA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";

const yesNo = {
  audience: "parents",
  prompt: "האם להמשיך?",
  questionFormat: "yes_no",
  selectionMode: "single",
  options: ["כן", "לא"]
};

assert.equal(BROADCAST_SMART_REPLY_MAX_LENGTH, 2000);
assert.equal(validateBroadcastQuestion(yesNo).ok, true);
const off = validateBroadcastQuestion({
  ...yesNo,
  smartReplies: { enabled: false, mode: "general", generalText: "לא נשלח" }
});
assert.equal(off.ok, true);
if (off.ok) assert.deepEqual(off.value.smartReplies, { enabled: false });

const general = validateBroadcastQuestion({
  ...yesNo,
  smartReplies: { enabled: true, mode: "general", generalText: `  ${BROADCAST_SMART_REPLY_DEFAULT}  ` }
});
assert.equal(general.ok, true);
if (general.ok && general.value.smartReplies.enabled && general.value.smartReplies.mode === "general") {
  assert.equal(general.value.smartReplies.text, BROADCAST_SMART_REPLY_DEFAULT);
}

assert.equal(
  validateBroadcastQuestion({
    ...yesNo,
    smartReplies: { enabled: true, mode: "general", generalText: "  " }
  }).ok,
  false
);
assert.equal(
  validateBroadcastQuestion({
    ...yesNo,
    smartReplies: { enabled: true, mode: "by_answer", repliesByLabel: { כן: "תודה על כן" } }
  }).ok,
  false
);
const byAnswer = validateBroadcastQuestion({
  ...yesNo,
  smartReplies: { enabled: true, mode: "by_answer", repliesByLabel: { לא: "תודה על לא", כן: "תודה על כן" } }
});
assert.equal(byAnswer.ok, true);
if (byAnswer.ok && byAnswer.value.smartReplies.enabled && byAnswer.value.smartReplies.mode === "by_answer") {
  assert.deepEqual(byAnswer.value.smartReplies.repliesByLabel, { כן: "תודה על כן", לא: "תודה על לא" });
}

assert.equal(isThumbsUpNannyPayload({ nanny_variant: "thumbs_up" }), true);
assert.equal(isThumbsUpNannyPayload({ question_id: "11111111-1111-4111-8111-111111111111" }), false);
assert.equal(nannyTalkImageSrc({ nanny_variant: "thumbs_up" }), NANNY_THUMBS_UP_IMAGE_SRC);
assert.equal(nannyTalkImageSrc({}), NANNY_IMAGE_SRC);
assert.match(form, /AdminBroadcastSmartReplyFields/);
assert.match(fields, /הודעה אחידה לכל המשיבים/);
assert.match(fields, /הודעה מותאמת לפי התשובה/);
assert.match(fields, /NANNY_THUMBS_UP_IMAGE_SRC/);
assert.match(fields, /לא שליחת שידור נוספת/);
assert.match(overlay, /nannyTalkImageSrc\(regularBroadcast\.payload\)/);
const notificationInsert = smartSql.slice(
  smartSql.indexOf("insert into public.notifications"),
  smartSql.indexOf("on conflict (user_id, kind, dedupe_key)")
);
assert.match(notificationInsert, /source_question_id/);
assert.doesNotMatch(notificationInsert, /'question_id'/);
assert.match(smartSql, /smart-reply:/);
const smartQuestionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
assert.equal(
  isServerSmartReplyNotification({
    dedupe_key: `${SMART_REPLY_PUSH_DEDUPE_PREFIX}${smartQuestionId}`,
    payload: { smart_reply: true, source_question_id: smartQuestionId }
  }),
  true
);
assert.match(readFileSync(resolve(root, "lib/push/deliver-notification.ts"), "utf8"), /isServerSmartReplyNotification/);
assert.match(smartSql, /nanny_variant', 'thumbs_up'/);
assert.match(smartSql, /revoke select on table public\.broadcast_question_options from authenticated/);

function asJson(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

async function asRole<T>(
  db: PGlite,
  role: "authenticated" | "service_role",
  userId: string | null,
  run: () => Promise<T>
): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`);
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec(`reset role`);
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

async function expectError(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), pattern);
    return;
  }
  assert.fail(`expected error matching ${pattern}`);
}

async function send(
  db: PGlite,
  key: string,
  enabled: boolean,
  mode: string | null,
  text: string | null,
  replies: Record<string, string>,
  options = ["כן", "לא"],
  format = "yes_no",
  selection = "single"
) {
  return asRole(db, "service_role", null, async () => {
    const result = await db.query<{ result: unknown }>(
      `select public.admin_send_broadcast_question($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) as result`,
      ["parents", "האם להמשיך?", format, selection, options, key, false, null, enabled, mode, text, JSON.stringify(replies)]
    );
    return asJson(result.rows[0]?.result);
  });
}

async function optionId(db: PGlite, questionId: string, label: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `select id::text from public.broadcast_question_options where question_id = $1 and label = $2`,
    [questionId, label]
  );
  const id = result.rows[0]?.id;
  assert.ok(id);
  return id;
}

async function submit(db: PGlite, userId: string, questionId: string, optionIds: string[]) {
  return asRole(db, "authenticated", userId, async () => {
    const result = await db.query<{ result: unknown }>(
      `select public.submit_broadcast_question_response($1, $2::uuid[]) as result`,
      [questionId, optionIds]
    );
    return asJson(result.rows[0]?.result);
  });
}

async function repliesFor(db: PGlite, userId: string) {
  return db.query<{ body: string; payload: { question_id?: string; nanny_variant?: string; smart_reply?: boolean } }>(
    `select body, payload from public.notifications
     where user_id = $1 and dedupe_key like 'smart-reply:%'`,
    [userId]
  );
}

async function main(): Promise<void> {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create table public.test_broadcast_audience (audience text not null, user_id uuid not null);
    create or replace function public.admin_broadcast_recipient_ids(p_audience text)
    returns table(user_id uuid) language sql stable set search_path = public as $$
      select m.user_id from public.test_broadcast_audience m where m.audience = p_audience;
    $$;
    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      kind text not null,
      title text not null,
      body text,
      payload jsonb not null default '{}'::jsonb,
      read_at timestamptz,
      created_at timestamptz not null default now(),
      dedupe_key text
    );
    create unique index notifications_user_kind_dedupe_uidx
      on public.notifications (user_id, kind, dedupe_key) where dedupe_key is not null;
  `);
  await db.exec(v2Sql);
  await db.exec(smartSql);
  await db.exec(`
    insert into auth.users (id) values ('${ADA}'), ('${BEN}');
    insert into public.test_broadcast_audience (audience, user_id) values
      ('parents', '${ADA}'),
      ('parents', '${BEN}');
  `);

  const hiddenReply = await db.query<{ ok: boolean }>(
    `select has_column_privilege('authenticated', 'public.broadcast_question_options', 'reply_text', 'SELECT') as ok`
  );
  assert.equal(hiddenReply.rows[0]?.ok, false);
  const hiddenConfig = await db.query<{ ok: boolean }>(
    `select has_column_privilege('authenticated', 'public.broadcast_questions', 'smart_reply_text', 'SELECT') as ok`
  );
  assert.equal(hiddenConfig.rows[0]?.ok, false);

  const plain = await send(db, "plain", false, null, null, {});
  const plainId = String(plain.question_id);
  const plainYes = await optionId(db, plainId, "כן");
  const plainSaved = await submit(db, ADA, plainId, [plainYes]);
  assert.equal(plainSaved.smart_reply, null);
  assert.equal((await repliesFor(db, ADA)).rows.length, 0);

  const thanks = await send(db, "thanks", true, "general", "תודה שענית!", {});
  const thanksId = String(thanks.question_id);
  const thanksYes = await optionId(db, thanksId, "כן");
  const thanksNo = await optionId(db, thanksId, "לא");
  const first = await submit(db, ADA, thanksId, [thanksYes]);
  assert.equal(first.replaced, false);
  assert.equal(first.smart_reply, "תודה שענית!");
  const stored = await repliesFor(db, ADA);
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0]?.body, "תודה שענית!");
  assert.equal(stored.rows[0]?.payload.nanny_variant, "thumbs_up");
  assert.equal(stored.rows[0]?.payload.smart_reply, true);
  assert.equal(stored.rows[0]?.payload.question_id, undefined);
  const replaced = await submit(db, ADA, thanksId, [thanksNo]);
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.smart_reply, null);
  assert.equal((await repliesFor(db, ADA)).rows.length, 1);

  const mapped = await send(db, "mapped", true, "by_answer", null, {
    כן: "שמחים שכן",
    לא: "תודה על לא"
  });
  const mappedId = String(mapped.question_id);
  const mappedNo = await optionId(db, mappedId, "לא");
  const mappedSaved = await submit(db, BEN, mappedId, [mappedNo]);
  assert.equal(mappedSaved.smart_reply, "תודה על לא");
  assert.equal((await repliesFor(db, BEN)).rows[0]?.body, "תודה על לא");

  const multi = await send(
    db,
    "multi",
    true,
    "by_answer",
    null,
    { בוקר: "בוקר טוב", ערב: "ערב טוב" },
    ["בוקר", "ערב"],
    "custom",
    "multiple"
  );
  const multiId = String(multi.question_id);
  const morning = await optionId(db, multiId, "בוקר");
  const evening = await optionId(db, multiId, "ערב");
  const both = await submit(db, ADA, multiId, [evening, morning]);
  assert.equal(both.smart_reply, "בוקר טוב\n\nערב טוב");

  const before = await db.query<{ count: string }>(`select count(*)::text as count from public.broadcast_questions`);
  await expectError(
    () => send(db, "broken", true, "by_answer", null, { כן: "רק כן" }),
    /smart reply mapping does not match the answers/
  );
  const after = await db.query<{ count: string }>(`select count(*)::text as count from public.broadcast_questions`);
  assert.equal(after.rows[0]?.count, before.rows[0]?.count);

  console.log("broadcast smart replies checks passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
