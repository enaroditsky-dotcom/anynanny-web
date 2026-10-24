import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  mergeSelectedPublicIds,
  parseSelectedPublicIdList,
  readSelectedRecipientPreview
} from "../lib/admin/broadcast-selected-recipients";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = "supabase/migrations/20261023111320_broadcast_selected_public_ids.sql";
const sql = readFileSync(resolve(root, migrationPath), "utf8");
const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");

const PARENT = "11111111-1111-4111-8111-111111111111";
const SITTER = "22222222-2222-4222-8222-222222222222";
const EXTRA = "33333333-3333-4333-8333-333333333333";
const SUSPENDED = "44444444-4444-4444-8444-444444444444";
const BANNED = "55555555-5555-4555-8555-555555555555";
const DELETED = "66666666-6666-4666-8666-666666666666";
const MISSING_AUTH = "77777777-7777-4777-8777-777777777777";
const MISMATCH = "88888888-8888-4888-8888-888888888888";
const AMBIGUOUS_A = "99999999-9999-4999-8999-999999999991";
const AMBIGUOUS_B = "99999999-9999-4999-8999-999999999992";
const MIRROR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MIRROR_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

function asJson(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

async function expectError(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, pattern, message);
    return;
  }
  assert.fail(`expected error matching ${pattern}`);
}

async function privilege(db: PGlite, statement: string): Promise<boolean> {
  const result = await db.query<{ ok: boolean }>(statement);
  return Boolean(result.rows[0]?.ok);
}

const parsed = parseSelectedPublicIdList(" rp-1001, RAN-8\nP-1002\tAN-3, CONS-10 ");
assert.equal(parsed.ok, true);
if (parsed.ok) assert.deepEqual(parsed.ids, ["RP-1001", "RAN-8", "P-1002", "AN-3", "CONS-10"]);

assert.equal(parseSelectedPublicIdList("1002").ok, false);
assert.equal(parseSelectedPublicIdList("11111111-1111-4111-8111-111111111111").ok, false);
assert.equal(parseSelectedPublicIdList("RP").ok, false);
assert.equal(parseSelectedPublicIdList("SITTER-1").ok, false);
assert.equal(parseSelectedPublicIdList("").ok, false);
assert.equal(parseSelectedPublicIdList("RP-1, rp-1").ok, false);
assert.equal(parseSelectedPublicIdList(Array.from({ length: 51 }, (_, index) => `RP-${index + 1}`)).ok, false);
assert.equal(parseSelectedPublicIdList(["RP-1", 2]).ok, false);

const merged = mergeSelectedPublicIds(["RP-1"], "RAN-2");
assert.equal(merged.ok, true);
if (merged.ok) assert.deepEqual(merged.ids, ["RP-1", "RAN-2"]);
assert.equal(mergeSelectedPublicIds(["RP-1"], "RP-1").ok, false);

const hidden = readSelectedRecipientPreview({
  ok: true,
  recipient_count: 1,
  entries: [{ public_id: "RP-1", role: "parent", ok: true, reason: null, user_id: PARENT }]
});
assert.equal(hidden.entries[0]?.publicId, "RP-1");
assert.equal("userId" in hidden.entries[0], false);
assert.equal(JSON.stringify(hidden).includes(PARENT), false);

assert.doesNotMatch(sql, /create or replace function public\.admin_broadcast_recipient_ids/);
assert.doesNotMatch(sql, /create or replace function public\.admin_send_in_app_broadcast/);
assert.doesNotMatch(sql, /create or replace function public\.admin_send_broadcast_question/);
assert.doesNotMatch(sql, /create or replace function public\.admin_count_broadcast_recipients/);
assert.doesNotMatch(sqlWithoutComments, /admin_broadcast_recipient_ids\s*\(/);
assert.doesNotMatch(sqlWithoutComments, /p\.public_id|profiles\.public_id/);
assert.match(sql, /parent_serial/);
assert.match(sql, /nanny_serial/);
assert.match(sql, /security definer/);
assert.match(sql, /set search_path = public/);
assert.match(sql, /revoke all on function public\.admin_selected_broadcast_matches\(text\[\]\) from service_role/);
assert.match(sql, /grant execute on function public\.admin_preview_selected_broadcast_recipients\(text\[\]\) to service_role/);
assert.match(sql, /grant execute on function public\.admin_send_selected_in_app_broadcast\(text\[\], text, text, text, text, text\) to service_role/);
assert.match(sql, /grant execute on function public\.admin_send_selected_broadcast_question\(text\[\], text, text, text, text\[\], text\) to service_role/);
assert.doesNotMatch(
  sqlWithoutComments,
  /grant execute on function public\.admin_send_selected_in_app_broadcast[\s\S]{0,120}to authenticated/
);
assert.match(sql, /selected_public_ids is not null/);
assert.match(sql, /audience_type <> 'selected_public_ids'/);

const ordinaryRoute = readFileSync(resolve(root, "app/api/admin/broadcast/route.ts"), "utf8");
const questionRoute = readFileSync(resolve(root, "app/api/admin/broadcast/question/route.ts"), "utf8");
const testStart = questionRoute.indexOf('if (action === "test")');
const testEnd = questionRoute.indexOf("const selected = requireSelectedPublicIds", testStart);
assert.ok(testStart >= 0 && testEnd > testStart);
const questionTest = questionRoute.slice(testStart, testEnd);
assert.match(questionTest, /resolveConfiguredBroadcastTestRecipient/);
assert.doesNotMatch(questionTest, /public_ids|sendSelectedAdminBroadcastQuestion|admin_broadcast_recipient_ids/);
assert.match(ordinaryRoute, /sendBroadcastTestToUser/);
const ordinaryTestStart = ordinaryRoute.indexOf('if (action === "test")');
const ordinaryTestEnd = ordinaryRoute.indexOf("requireSelectedPublicIds", ordinaryTestStart);
assert.doesNotMatch(ordinaryRoute.slice(ordinaryTestStart, ordinaryTestEnd), /public_ids|sendSelectedAdminBroadcast/);

async function main(): Promise<void> {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      deleted_at timestamptz,
      banned_until timestamptz
    );
    create table public.profiles (
      id uuid primary key,
      role text,
      parent_serial text,
      nanny_serial text,
      suspended_at timestamptz
    );
    create table public.sitter_profiles (
      id uuid primary key,
      nanny_serial text
    );
    create table public.admin_broadcasts (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      admin_actor text not null default 'admin_dashboard',
      audience_type text not null,
      recipient_count integer not null default 0,
      title text not null,
      body text not null,
      cta_label text,
      cta_route text,
      idempotency_key text not null unique,
      constraint admin_broadcasts_admin_actor_check check (admin_actor = 'admin_dashboard'),
      constraint admin_broadcasts_audience_type_check check (
        audience_type in (
          'all_users', 'parents', 'sitters', 'identity_unverified', 'identity_verified',
          'profile_incomplete', 'profile_complete', 'rp_marketing_opt_in', 'ran_marketing_opt_in'
        )
      )
    );
    create table public.broadcast_questions (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      closed_at timestamptz,
      admin_actor text not null default 'admin_dashboard',
      audience_type text not null,
      question_format text not null,
      selection_mode text not null,
      prompt text not null,
      recipient_count integer not null default 0,
      idempotency_key text not null unique,
      is_test boolean not null default false,
      constraint broadcast_questions_admin_actor_chk check (admin_actor = 'admin_dashboard'),
      constraint broadcast_questions_audience_type_chk check (
        audience_type in (
          'all_users', 'parents', 'sitters', 'identity_unverified', 'identity_verified',
          'profile_incomplete', 'profile_complete', 'rp_marketing_opt_in', 'ran_marketing_opt_in'
        )
      )
    );
    create table public.broadcast_question_options (
      id uuid primary key default gen_random_uuid(),
      question_id uuid not null,
      label text not null,
      position integer not null
    );
    create table public.broadcast_question_recipients (
      question_id uuid not null,
      user_id uuid not null,
      primary key (question_id, user_id)
    );
    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      kind text not null,
      title text not null,
      body text not null,
      payload jsonb,
      dedupe_key text
    );
    create unique index notifications_user_kind_dedupe_key
      on public.notifications (user_id, kind, dedupe_key)
      where dedupe_key is not null;

    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    grant select on table public.broadcast_questions to authenticated;

    create or replace function public.admin_broadcast_recipient_ids(p_audience text)
    returns table(user_id uuid)
    language sql
    as $$ select id from public.profiles $$;

    create or replace function public.admin_send_in_app_broadcast(
      p_audience text, p_title text, p_body text, p_cta_label text, p_cta_route text, p_idempotency_key text
    ) returns jsonb language sql as $$ select jsonb_build_object('marker', 'ordinary-unchanged') $$;

    create or replace function public.admin_send_broadcast_question(
      p_audience text, p_prompt text, p_question_format text, p_selection_mode text,
      p_options text[], p_idempotency_key text, p_is_test boolean, p_test_user_id uuid
    ) returns jsonb language sql as $$ select jsonb_build_object('marker', 'question-unchanged') $$;
  `);

  const beforeOrdinary = await db.query<{ def: string }>(
    `select pg_get_functiondef('public.admin_send_in_app_broadcast(text, text, text, text, text, text)'::regprocedure) as def`
  );
  const beforeQuestion = await db.query<{ def: string }>(
    `select pg_get_functiondef('public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid)'::regprocedure) as def`
  );
  const beforeAudience = await db.query<{ def: string }>(
    `select pg_get_functiondef('public.admin_broadcast_recipient_ids(text)'::regprocedure) as def`
  );

  await db.exec(sql);

  assert.equal(
    (await db.query<{ def: string }>(
      `select pg_get_functiondef('public.admin_send_in_app_broadcast(text, text, text, text, text, text)'::regprocedure) as def`
    )).rows[0]?.def,
    beforeOrdinary.rows[0]?.def
  );
  assert.equal(
    (await db.query<{ def: string }>(
      `select pg_get_functiondef('public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid)'::regprocedure) as def`
    )).rows[0]?.def,
    beforeQuestion.rows[0]?.def
  );
  assert.equal(
    (await db.query<{ def: string }>(
      `select pg_get_functiondef('public.admin_broadcast_recipient_ids(text)'::regprocedure) as def`
    )).rows[0]?.def,
    beforeAudience.rows[0]?.def
  );

  const selectedSend = await db.query<{ def: string }>(
    `select pg_get_functiondef('public.admin_send_selected_in_app_broadcast(text[], text, text, text, text, text)'::regprocedure) as def`
  );
  assert.doesNotMatch(selectedSend.rows[0]?.def ?? "", /admin_broadcast_recipient_ids|all_users/);
  const selectedQuestion = await db.query<{ def: string }>(
    `select pg_get_functiondef('public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text)'::regprocedure) as def`
  );
  assert.doesNotMatch(selectedQuestion.rows[0]?.def ?? "", /admin_broadcast_recipient_ids|all_users/);

  assert.equal(
    await privilege(db, `select has_function_privilege('service_role', 'public.admin_selected_broadcast_matches(text[])', 'EXECUTE') as ok`),
    false
  );
  assert.equal(
    await privilege(db, `select has_function_privilege('anon', 'public.admin_send_selected_in_app_broadcast(text[], text, text, text, text, text)', 'EXECUTE') as ok`),
    false
  );
  assert.equal(
    await privilege(db, `select has_function_privilege('authenticated', 'public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text)', 'EXECUTE') as ok`),
    false
  );
  assert.equal(
    await privilege(db, `select has_function_privilege('service_role', 'public.admin_preview_selected_broadcast_recipients(text[])', 'EXECUTE') as ok`),
    true
  );
  assert.equal(
    await privilege(
      db,
      `select has_column_privilege('authenticated', 'public.broadcast_questions', 'selected_public_ids', 'SELECT') as ok`
    ),
    false
  );
  assert.equal(
    await privilege(db, `select has_column_privilege('authenticated', 'public.broadcast_questions', 'prompt', 'SELECT') as ok`),
    true
  );

  await db.exec(`
    insert into auth.users (id) values
      ('${PARENT}'), ('${SITTER}'), ('${EXTRA}'), ('${SUSPENDED}'), ('${MISMATCH}'), ('${MIRROR_A}');
    insert into auth.users (id, banned_until) values ('${BANNED}', '2099-01-01');
    insert into auth.users (id, deleted_at) values ('${DELETED}', now());
    insert into public.profiles (id, role, parent_serial) values
      ('${PARENT}', 'parent', 'RP-1001'),
      ('${EXTRA}', 'parent', 'RP-9999'),
      ('${SUSPENDED}', 'parent', 'P-2000'),
      ('${BANNED}', 'parent', 'RP-2001'),
      ('${DELETED}', 'parent', 'P-2002'),
      ('${MISSING_AUTH}', 'parent', 'P-2003'),
      ('${MISMATCH}', 'sitter', 'RP-7777'),
      ('${AMBIGUOUS_A}', 'parent', 'P-3000'),
      ('${AMBIGUOUS_B}', 'parent', 'P-3000');
    update public.profiles set suspended_at = now() where id = '${SUSPENDED}';
    insert into public.profiles (id, role, nanny_serial) values
      ('${SITTER}', 'sitter', 'RAN-1004'),
      ('${MIRROR_A}', 'sitter', 'RAN-9');
    insert into public.sitter_profiles (id, nanny_serial) values
      ('${SITTER}', 'RAN-1004'),
      ('${MIRROR_B}', 'RAN-9');
  `);

  const preview = asJson(
    (
      await db.query<{ result: unknown }>(
        `select public.admin_preview_selected_broadcast_recipients(array['rp-1001','RAN-1004']::text[]) as result`
      )
    ).rows[0]?.result
  );
  const readPreview = readSelectedRecipientPreview(preview);
  assert.equal(readPreview.ok, true);
  assert.equal(readPreview.recipientCount, 2);
  assert.deepEqual(
    readPreview.entries.map((entry) => entry.publicId),
    ["RP-1001", "RAN-1004"]
  );
  assert.equal(JSON.stringify(preview).includes(PARENT), false);

  const bad = readSelectedRecipientPreview(
    asJson(
      (
        await db.query<{ result: unknown }>(
          `select public.admin_preview_selected_broadcast_recipients(array['RP-1001','RP-404','P-2000','RP-2001','P-2002','P-2003','RP-7777','P-3000','RAN-9','RP-1001']::text[]) as result`
        )
      ).rows[0]?.result
    )
  );
  assert.equal(bad.ok, false);
  const reasons = new Map(bad.entries.map((entry) => [entry.publicId, entry.reason]));
  assert.equal(reasons.get("RP-1001"), "duplicate");
  assert.equal(reasons.get("RP-404"), "unknown");
  assert.equal(reasons.get("P-2000"), "inactive");
  assert.equal(reasons.get("RP-2001"), "inactive");
  assert.equal(reasons.get("P-2002"), "inactive");
  assert.equal(reasons.get("P-2003"), "inactive");
  assert.equal(reasons.get("RP-7777"), "role_mismatch");
  assert.equal(reasons.get("P-3000"), "ambiguous");
  assert.equal(reasons.get("RAN-9"), "ambiguous");

  const empty = readSelectedRecipientPreview(
    asJson(
      (
        await db.query<{ result: unknown }>(
          `select public.admin_preview_selected_broadcast_recipients('{}'::text[]) as result`
        )
      ).rows[0]?.result
    )
  );
  assert.equal(empty.ok, false);
  assert.equal(empty.error, "empty");
  assert.equal(empty.recipientCount, 0);

  await expectError(
    () =>
      db.query(
        `select public.admin_send_selected_in_app_broadcast(array['RP-1001','RP-404'], 'כותרת', 'תוכן', null, null, 'bad_batch')`
      ),
    /selected recipients are invalid/
  );
  const leftover = await db.query<{ count: number }>(
    `select count(*)::int as count from public.admin_broadcasts where idempotency_key = 'bad_batch'`
  );
  assert.equal(leftover.rows[0]?.count, 0);
  const leaked = await db.query<{ count: number }>(`select count(*)::int as count from public.notifications`);
  assert.equal(leaked.rows[0]?.count, 0);

  const sent = asJson(
    (
      await db.query<{ result: unknown }>(
        `select public.admin_send_selected_in_app_broadcast(array['RP-1001','RAN-1004'], 'כותרת', 'תוכן', null, null, 'selected_once') as result`
      )
    ).rows[0]?.result
  );
  assert.equal(sent.already_sent, false);
  assert.equal(sent.recipient_count, 2);
  const again = asJson(
    (
      await db.query<{ result: unknown }>(
        `select public.admin_send_selected_in_app_broadcast(array['RP-9999'], 'אחר', 'אחר', null, null, 'selected_once') as result`
      )
    ).rows[0]?.result
  );
  assert.equal(again.already_sent, true);
  assert.equal(again.recipient_count, 2);
  const notified = await db.query<{ user_id: string }>(
    `select user_id::text as user_id from public.notifications order by user_id`
  );
  assert.deepEqual(notified.rows.map((row) => row.user_id), [PARENT, SITTER].sort());

  const question = asJson(
    (
      await db.query<{ result: unknown }>(
        `select public.admin_send_selected_broadcast_question(array['RP-1001'], 'האם להמשיך?', 'yes_no', 'single', array['כן','לא'], 'q_once') as result`
      )
    ).rows[0]?.result
  );
  assert.equal(question.already_sent, false);
  assert.equal(question.recipient_count, 1);
  assert.equal(question.is_test, false);
  const questionAgain = asJson(
    (
      await db.query<{ result: unknown }>(
        `select public.admin_send_selected_broadcast_question(array['RP-9999'], 'אחרת?', 'yes_no', 'single', array['כן','לא'], 'q_once') as result`
      )
    ).rows[0]?.result
  );
  assert.equal(questionAgain.already_sent, true);
  assert.equal(questionAgain.recipient_count, 1);
  const questionRecipients = await db.query<{ count: number }>(
    `select count(*)::int as count from public.broadcast_question_recipients`
  );
  assert.equal(questionRecipients.rows[0]?.count, 1);
  const extra = await db.query<{ count: number }>(
    `select count(*)::int as count from public.notifications where user_id = '${EXTRA}'`
  );
  assert.equal(extra.rows[0]?.count, 0);

  await expectError(
    () =>
      db.query(
        `select public.admin_send_selected_broadcast_question(array['RP-1001','NOPE'], 'האם להמשיך?', 'yes_no', 'single', array['כן','לא'], 'q_bad')`
      ),
    /selected recipients are invalid/
  );
  const badQuestion = await db.query<{ count: number }>(
    `select count(*)::int as count from public.broadcast_questions where idempotency_key = 'q_bad'`
  );
  assert.equal(badQuestion.rows[0]?.count, 0);
}

main()
  .then(async () => {
    console.log("selected broadcast recipient checks passed");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
