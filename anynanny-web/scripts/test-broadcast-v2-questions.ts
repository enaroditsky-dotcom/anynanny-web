import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = "supabase/migrations/20261019120000_broadcast_v2_questions.sql";
const sql = readFileSync(resolve(root, migrationPath), "utf8");
const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");

const ADA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
const CY = "33333333-3333-4333-8333-333333333333";

const SEND_FN =
  "public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid)";
const SUBMIT_FN = "public.submit_broadcast_question_response(uuid, uuid[])";
const CLOSE_FN = "public.admin_close_broadcast_question(uuid)";

function asJson(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function optionIds(value: unknown): string[] {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown[]) : (value as unknown[]);
  return parsed.map((item) => String(item));
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

async function privilege(
  db: PGlite,
  sqlText: string,
  params: unknown[] = []
): Promise<boolean> {
  const result = await db.query<{ ok: boolean }>(sqlText, params);
  return Boolean(result.rows[0]?.ok);
}

async function main(): Promise<void> {
  assert.match(sql, /admin_broadcast_recipient_ids\(p_audience\)/);
  assert.doesNotMatch(sql, /create or replace function public\.admin_broadcast_recipient_ids/);
  assert.doesNotMatch(sql, /create or replace function public\.admin_send_in_app_broadcast/);
  assert.doesNotMatch(sql, /create or replace function public\.admin_count_broadcast_recipients/);
  assert.match(sql, /insert into public\.notifications/);
  assert.match(sql, /'admin_broadcast'/);
  assert.match(sql, /left\(v_prompt, 80\)/);
  assert.match(sql, /'question_id', v_question_id/);
  assert.match(sql, /'broadcast_id', v_question_id/);
  assert.match(sql, /'is_test', v_is_test/);
  assert.match(sql, /v_question_id::text/);
  assert.match(
    sql,
    /from public\.broadcast_question_recipients r\s+where r\.question_id = v_question_id/
  );
  assert.match(sql, /on conflict \(user_id, kind, dedupe_key\) where dedupe_key is not null/);
  assert.match(sql, /notification delivery incomplete/);
  assert.doesNotMatch(sqlWithoutComments, /insert into public\.admin_broadcasts/);
  assert.doesNotMatch(sqlWithoutComments, /deliverCanonicalNotificationPush|twilio|nodemailer|net\.http_post/);
  assert.doesNotMatch(
    sql,
    /parent_onboarding_completed_at|marketing_consent|identity_verification_status|sitter_profiles/
  );
  assert.match(
    sql,
    /function public\.submit_broadcast_question_response\(\s*p_question_id uuid,\s*p_option_ids uuid\[\]\s*\)/
  );
  assert.doesNotMatch(sql, /p_user_id|p_user_ids/);
  assert.match(sql, /v_user uuid := auth\.uid\(\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select on table public\.broadcast_question_responses to authenticated/);
  assert.doesNotMatch(sqlWithoutComments, /grant insert on table public\.broadcast_question/);
  assert.doesNotMatch(sqlWithoutComments, /for insert[\s\S]{0,80}to authenticated/);
  assert.match(sql, /is_test boolean not null default false/);
  assert.match(sql, /rp_marketing_opt_in/);
  assert.match(sql, /ran_marketing_opt_in/);
  assert.match(sql, /'yes_no', 'custom'/);
  assert.match(sql, /'single', 'multiple'/);
  assert.doesNotMatch(
    readFileSync(resolve(root, "lib/admin/broadcast-send.ts"), "utf8"),
    /admin_send_broadcast_question|broadcast_question_responses/
  );
  assert.doesNotMatch(
    readFileSync(resolve(root, "app/api/admin/broadcast/route.ts"), "utf8"),
    /broadcast_question/
  );

  const db = new PGlite();
  try {
    await db.exec(`
      create schema if not exists auth;
      create table auth.users (
        id uuid primary key
      );
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
    `);
    await db.exec(`create role anon nologin noinherit`);
    await db.exec(`create role authenticated nologin noinherit`);
    await db.exec(`create role service_role nologin noinherit bypassrls`);

    await db.exec(`
      create table public.test_broadcast_audience (
        audience text not null,
        user_id uuid not null
      );

      create or replace function public.admin_broadcast_recipient_ids(p_audience text)
      returns table(user_id uuid)
      language sql
      stable
      set search_path = public
      as $$
        select m.user_id
        from public.test_broadcast_audience m
        where m.audience = p_audience;
      $$;

      create or replace function public.admin_send_in_app_broadcast(
        p_audience text,
        p_title text,
        p_body text,
        p_cta_label text,
        p_cta_route text,
        p_idempotency_key text
      )
      returns jsonb
      language sql
      as $$
        select jsonb_build_object('marker', 'regular-broadcast-unchanged');
      $$;
    `);

    const beforeRecipient = await db.query<{ def: string }>(
      `select pg_get_functiondef('public.admin_broadcast_recipient_ids(text)'::regprocedure) as def`
    );
    const beforeSend = await db.query<{ def: string }>(
      `select pg_get_functiondef('public.admin_send_in_app_broadcast(text, text, text, text, text, text)'::regprocedure) as def`
    );

    await db.exec(sql);

    const afterRecipient = await db.query<{ def: string }>(
      `select pg_get_functiondef('public.admin_broadcast_recipient_ids(text)'::regprocedure) as def`
    );
    const afterSend = await db.query<{ def: string }>(
      `select pg_get_functiondef('public.admin_send_in_app_broadcast(text, text, text, text, text, text)'::regprocedure) as def`
    );
    assert.equal(afterRecipient.rows[0]?.def, beforeRecipient.rows[0]?.def);
    assert.equal(afterSend.rows[0]?.def, beforeSend.rows[0]?.def);
    const marker = await db.query<{ result: unknown }>(
      `select public.admin_send_in_app_broadcast('parents', 't', 'b', null, null, 'k') as result`
    );
    assert.equal(asJson(marker.rows[0]?.result).marker, "regular-broadcast-unchanged");

    const secured = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity
      from pg_class
      where relname in (
        'broadcast_questions',
        'broadcast_question_options',
        'broadcast_question_recipients',
        'broadcast_question_responses'
      )
      order by relname
    `);
    assert.equal(secured.rows.length, 4);
    assert.ok(secured.rows.every((row) => row.relrowsecurity));

    const policies = await db.query<{ relname: string; polcmd: string }>(`
      select c.relname, p.polcmd
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      where c.relname like 'broadcast_question%'
    `);
    assert.ok(policies.rows.length >= 4);
    assert.ok(policies.rows.every((row) => row.polcmd === "r"));

    assert.equal(
      await privilege(db, `select has_table_privilege('authenticated', 'public.broadcast_question_responses', 'SELECT') as ok`),
      true
    );
    assert.equal(
      await privilege(db, `select has_table_privilege('authenticated', 'public.broadcast_question_responses', 'INSERT') as ok`),
      false
    );
    assert.equal(
      await privilege(db, `select has_table_privilege('authenticated', 'public.broadcast_question_responses', 'UPDATE') as ok`),
      false
    );
    assert.equal(
      await privilege(db, `select has_table_privilege('service_role', 'public.broadcast_questions', 'INSERT') as ok`),
      false
    );
    assert.equal(
      await privilege(db, `select has_table_privilege('service_role', 'public.broadcast_questions', 'SELECT') as ok`),
      true
    );
    assert.equal(await privilege(db, `select has_function_privilege('service_role', '${SEND_FN}', 'EXECUTE') as ok`), true);
    assert.equal(
      await privilege(db, `select has_function_privilege('authenticated', '${SEND_FN}', 'EXECUTE') as ok`),
      false
    );
    assert.equal(
      await privilege(db, `select has_function_privilege('anon', '${SEND_FN}', 'EXECUTE') as ok`),
      false
    );
    assert.equal(
      await privilege(db, `select has_function_privilege('authenticated', '${SUBMIT_FN}', 'EXECUTE') as ok`),
      true
    );
    assert.equal(await privilege(db, `select has_function_privilege('anon', '${SUBMIT_FN}', 'EXECUTE') as ok`), false);
    assert.equal(
      await privilege(db, `select has_function_privilege('service_role', '${SUBMIT_FN}', 'EXECUTE') as ok`),
      false
    );
    assert.equal(
      await privilege(db, `select has_function_privilege('authenticated', '${CLOSE_FN}', 'EXECUTE') as ok`),
      false
    );
    assert.equal(await privilege(db, `select has_function_privilege('service_role', '${CLOSE_FN}', 'EXECUTE') as ok`), true);

    await db.exec(`
      create table public.notifications (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users (id) on delete cascade,
        kind text not null,
        title text not null,
        body text,
        payload jsonb not null default '{}'::jsonb,
        read_at timestamptz,
        created_at timestamptz not null default now(),
        dedupe_key text
      );
      create unique index notifications_user_kind_dedupe_uidx
        on public.notifications (user_id, kind, dedupe_key)
        where dedupe_key is not null;

      create or replace function public.test_fail_question_notification()
      returns trigger
      language plpgsql
      as $$
      begin
        if coalesce(current_setting('test.fail_broadcast_question_notification', true), '') = 'on'
           and new.kind = 'admin_broadcast'
           and new.payload ? 'question_id'
        then
          raise exception 'notification delivery failed' using errcode = 'P0001';
        end if;
        return new;
      end;
      $$;

      create trigger test_fail_question_notification
        before insert on public.notifications
        for each row
        execute function public.test_fail_question_notification();

      insert into auth.users (id) values ('${ADA}'), ('${BEN}'), ('${CY}');
      insert into public.test_broadcast_audience (audience, user_id) values
        ('parents', '${ADA}'),
        ('parents', '${BEN}');
    `);

    await expectError(
      () =>
        send(db, {
          audience: "parents",
          prompt: "שאלה",
          format: "custom",
          mode: "single",
          options: ["אחת"],
          key: "custom-too-few",
          isTest: false,
          testUser: null
        }),
      /between 2 and 12 options/
    );
    await expectError(
      () =>
        send(db, {
          audience: "parents",
          prompt: "שאלה",
          format: "yes_no",
          mode: "multiple",
          options: ["כן", "לא"],
          key: "yes-no-multiple",
          isTest: false,
          testUser: null
        }),
      /yes_no questions are single-choice/
    );
    await expectError(
      () =>
        send(db, {
          audience: "parents",
          prompt: "שאלה",
          format: "yes_no",
          mode: "single",
          options: ["כן", "לא", "אולי"],
          key: "yes-no-three",
          isTest: false,
          testUser: null
        }),
      /exactly two options/
    );
    await expectError(
      () =>
        send(db, {
          audience: "parents",
          prompt: "<b>שאלה</b>",
          format: "yes_no",
          mode: "single",
          options: ["כן", "לא"],
          key: "html-prompt",
          isTest: false,
          testUser: null
        }),
      /plain text only/
    );
    await expectError(
      () =>
        send(db, {
          audience: "parents",
          prompt: "שאלה",
          format: "custom",
          mode: "single",
          options: ["כן", "כן"],
          key: "duplicate-label",
          isTest: false,
          testUser: null
        }),
      /duplicate option label/
    );
    await expectError(
      () =>
        send(db, {
          audience: "not_an_audience",
          prompt: "שאלה",
          format: "yes_no",
          mode: "single",
          options: ["כן", "לא"],
          key: "bad-audience",
          isTest: false,
          testUser: null
        }),
      /invalid audience/
    );
    await expectError(
      () =>
        send(db, {
          audience: "parents",
          prompt: "שאלה",
          format: "yes_no",
          mode: "single",
          options: ["כן", "לא"],
          key: "test-without-user",
          isTest: true,
          testUser: null
        }),
      /test user is required/
    );

    const campaign = await send(db, {
      audience: "parents",
      prompt: "האם תרצו עדכון?",
      format: "yes_no",
      mode: "single",
      options: ["  כן  ", "לא"],
      key: "campaign-yes-no",
      isTest: false,
      testUser: null
    });
    assert.equal(campaign.already_sent, false);
    assert.equal(campaign.is_test, false);
    assert.equal(campaign.recipient_count, 2);
    const campaignId = String(campaign.question_id);
    const campaignOptions = asOptions(campaign.options);
    assert.deepEqual(
      campaignOptions.map((option) => option.label),
      ["כן", "לא"]
    );
    const yesId = campaignOptions[0]?.id ?? "";
    const noId = campaignOptions[1]?.id ?? "";
    await assertDelivery(db, campaignId, [ADA, BEN], {
      isTest: false,
      title: "האם תרצו עדכון?",
      body: "האם תרצו עדכון?"
    });

    const replay = await send(db, {
      audience: "parents",
      prompt: "הודעה אחרת",
      format: "yes_no",
      mode: "single",
      options: ["כן", "לא"],
      key: "campaign-yes-no",
      isTest: false,
      testUser: null
    });
    assert.equal(replay.already_sent, true);
    assert.equal(String(replay.question_id), campaignId);
    const storedPrompt = await db.query<{ prompt: string }>(
      `select prompt from public.broadcast_questions where id = $1`,
      [campaignId]
    );
    assert.equal(storedPrompt.rows[0]?.prompt, "האם תרצו עדכון?");
    await assertDelivery(db, campaignId, [ADA, BEN], {
      isTest: false,
      title: "האם תרצו עדכון?",
      body: "האם תרצו עדכון?"
    });

    await db.exec(`delete from public.test_broadcast_audience`);
    await db.exec(`insert into public.test_broadcast_audience (audience, user_id) values ('parents', '${CY}')`);
    const recipients = await db.query<{ user_id: string }>(
      `select user_id::text from public.broadcast_question_recipients where question_id = $1 order by user_id`,
      [campaignId]
    );
    assert.deepEqual(
      recipients.rows.map((row) => row.user_id),
      [ADA, BEN]
    );

    await expectError(() => submit(db, CY, campaignId, [yesId]), /not a recipient/);
    await expectError(() => submit(db, ADA, campaignId, [yesId, noId]), /accept one option/);
    await expectError(() => submit(db, ADA, campaignId, [yesId, yesId]), /duplicate option/);

    const other = await send(db, {
      audience: "parents",
      prompt: "שאלה שנייה",
      format: "custom",
      mode: "multiple",
      options: ["בוקר", "ערב", "לילה"],
      key: "other-question",
      isTest: false,
      testUser: null
    });
    const otherId = String(other.question_id);
    const otherOption = asOptions(other.options)[0]?.id ?? "";
    assert.equal(other.recipient_count, 1);

    const first = await submit(db, ADA, campaignId, [yesId]);
    assert.equal(first.replaced, false);
    assert.deepEqual(optionIds(first.option_ids), [yesId]);

    await expectError(() => submit(db, ADA, campaignId, [otherOption]), /invalid option/);
    const stillYes = await db.query<{ option_id: string }>(
      `select option_id::text from public.broadcast_question_responses where question_id = $1 and user_id = $2`,
      [campaignId, ADA]
    );
    assert.deepEqual(
      stillYes.rows.map((row) => row.option_id),
      [yesId]
    );

    await db.exec(`select pg_sleep(0.02)`);
    const replaced = await submit(db, ADA, campaignId, [noId]);
    assert.equal(replaced.replaced, true);
    assert.deepEqual(optionIds(replaced.option_ids), [noId]);
    const timing = await db.query<{
      rows: string;
      same_first: boolean;
      bumped: boolean;
      user_id: string;
    }>(
      `select count(*)::text as rows,
              bool_and(resp.created_at = r.first_responded_at) as same_first,
              bool_and(resp.updated_at > resp.created_at) as bumped,
              min(resp.user_id::text) as user_id
       from public.broadcast_question_responses resp
       join public.broadcast_question_recipients r
         on r.question_id = resp.question_id
        and r.user_id = resp.user_id
       where resp.question_id = $1
         and resp.user_id = $2`,
      [campaignId, ADA]
    );
    assert.equal(timing.rows[0]?.rows, "1");
    assert.equal(timing.rows[0]?.same_first, true);
    assert.equal(timing.rows[0]?.bumped, true);
    assert.equal(timing.rows[0]?.user_id, ADA);

    const ben = await submit(db, BEN, campaignId, [yesId]);
    assert.deepEqual(optionIds(ben.option_ids), [yesId]);

    await asRole(db, "authenticated", ADA, async () => {
      const visibleQuestions = await db.query<{ id: string }>(
        `select id::text from public.broadcast_questions order by id`
      );
      assert.deepEqual(
        visibleQuestions.rows.map((row) => row.id),
        [campaignId]
      );
      const visibleResponses = await db.query<{ user_id: string; option_id: string }>(
        `select user_id::text, option_id::text
         from public.broadcast_question_responses
         where question_id = $1`,
        [campaignId]
      );
      assert.deepEqual(visibleResponses.rows, [{ user_id: ADA, option_id: noId }]);
    });

    await asRole(db, "authenticated", ADA, async () => {
      await expectError(
        () =>
          db.query(
            `insert into public.broadcast_question_responses (question_id, user_id, option_id)
             values ($1, $2, $3)`,
            [campaignId, BEN, yesId]
          ),
        /permission denied/
      );
    });

    await asRole(db, "service_role", null, async () => {
      await expectError(
        () => db.query(`select public.submit_broadcast_question_response($1, $2)`, [campaignId, [yesId]]),
        /permission denied/
      );
    });

    await asRole(db, "authenticated", ADA, async () => {
      await expectError(
        () =>
          db.query(
            `select public.admin_send_broadcast_question($1,$2,$3,$4,$5,$6,$7,$8)`,
            ["parents", "שאלה", "yes_no", "single", ["כן", "לא"], "from-user", false, null]
          ),
        /permission denied/
      );
    });

    const multi = await send(db, {
      audience: "sitters",
      prompt: "מתי נוח?",
      format: "custom",
      mode: "multiple",
      options: ["בוקר", "צהריים", "ערב"],
      key: "multi-ada",
      isTest: true,
      testUser: ADA
    });
    assert.equal(multi.is_test, true);
    assert.equal(multi.recipient_count, 1);
    const multiId = String(multi.question_id);
    const multiOptions = asOptions(multi.options);
    const morning = multiOptions[0]?.id ?? "";
    const noon = multiOptions[1]?.id ?? "";
    const evening = multiOptions[2]?.id ?? "";

    const multiRecipients = await db.query<{ user_id: string }>(
      `select user_id::text from public.broadcast_question_recipients where question_id = $1`,
      [multiId]
    );
    assert.deepEqual(
      multiRecipients.rows.map((row) => row.user_id),
      [ADA]
    );
    await assertDelivery(db, multiId, [ADA], {
      isTest: true,
      title: "מתי נוח?",
      body: "מתי נוח?"
    });
    const realCampaigns = await db.query<{ id: string }>(
      `select id::text from public.broadcast_questions where is_test = false order by created_at`
    );
    assert.ok(!realCampaigns.rows.some((row) => row.id === multiId));

    await submit(db, ADA, multiId, [morning, noon]);
    await db.exec(`select pg_sleep(0.02)`);
    const multiUpdated = await submit(db, ADA, multiId, [noon, evening]);
    assert.equal(multiUpdated.replaced, true);
    assert.deepEqual(optionIds(multiUpdated.option_ids), [noon, evening]);
    const multiRows = await db.query<{ option_id: string }>(
      `select option_id::text
       from public.broadcast_question_responses
       where question_id = $1
       order by created_at, option_id`,
      [multiId]
    );
    assert.deepEqual(
      multiRows.rows.map((row) => row.option_id).sort(),
      [noon, evening].sort()
    );

    await expectError(() => submit(db, ADA, multiId, [morning, "99999999-9999-4999-8999-999999999999"]), /invalid option/);
    const unchanged = await db.query<{ option_id: string }>(
      `select option_id::text from public.broadcast_question_responses where question_id = $1`,
      [multiId]
    );
    assert.deepEqual(
      unchanged.rows.map((row) => row.option_id).sort(),
      [noon, evening].sort()
    );

    await db.transaction(async (tx) => {
      await tx.query(
        `delete from public.broadcast_question_responses where question_id = $1 and user_id = $2`,
        [campaignId, ADA]
      );
      await tx.query(
        `insert into public.broadcast_question_responses (question_id, user_id, option_id)
         values ($1, $2, $3)`,
        [campaignId, ADA, yesId]
      );
      await tx.query(
        `insert into public.broadcast_question_responses (question_id, user_id, option_id)
         values ($1, $2, $3)`,
        [campaignId, ADA, noId]
      );
    }).then(
      () => assert.fail("single-choice trigger should reject a second option"),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /accept one option/, message);
      }
    );
    const afterRollback = await db.query<{ option_id: string }>(
      `select option_id::text from public.broadcast_question_responses where question_id = $1 and user_id = $2`,
      [campaignId, ADA]
    );
    assert.deepEqual(
      afterRollback.rows.map((row) => row.option_id),
      [noId]
    );

    await asRole(db, "service_role", null, async () => {
      const closed = await db.query<{ result: unknown }>(
        `select public.admin_close_broadcast_question($1) as result`,
        [campaignId]
      );
      const first = asJson(closed.rows[0]?.result);
      assert.equal(first.already_closed, false);
      const again = await db.query<{ result: unknown }>(
        `select public.admin_close_broadcast_question($1) as result`,
        [campaignId]
      );
      const second = asJson(again.rows[0]?.result);
      assert.equal(second.already_closed, true);
      assert.equal(second.closed_at, first.closed_at);
    });
    await expectError(() => submit(db, ADA, campaignId, [yesId]), /question is closed/);
    const afterClose = await db.query<{ option_id: string }>(
      `select option_id::text from public.broadcast_question_responses where question_id = $1 and user_id = $2`,
      [campaignId, ADA]
    );
    assert.deepEqual(
      afterClose.rows.map((row) => row.option_id),
      [noId]
    );

    await expectError(
      () =>
        db.query(
          `insert into public.broadcast_questions (
             audience_type, question_format, selection_mode, prompt, idempotency_key
           ) values ('parents', 'custom', 'single', 'ללא אפשרויות', 'no-options')`
        ),
      /between 2 and 12 options/
    );

    const longPrompt = "א".repeat(90);
    const longSend = await send(db, {
      audience: "parents",
      prompt: longPrompt,
      format: "yes_no",
      mode: "single",
      options: ["כן", "לא"],
      key: "long-title",
      isTest: true,
      testUser: ADA
    });
    await assertDelivery(db, String(longSend.question_id), [ADA], {
      isTest: true,
      title: longPrompt.slice(0, 80),
      body: longPrompt
    });

    const beforeFailure = await db.query<{ count: string }>(
      `select count(*)::text as count from public.broadcast_questions`
    );
    await db.exec(`select set_config('test.fail_broadcast_question_notification', 'on', false)`);
    try {
      await expectError(
        () =>
          send(db, {
            audience: "parents",
            prompt: "המשלוח ייכשל",
            format: "yes_no",
            mode: "single",
            options: ["כן", "לא"],
            key: "delivery-fails",
            isTest: true,
            testUser: ADA
          }),
        /notification delivery failed/
      );
    } finally {
      await db.exec(`select set_config('test.fail_broadcast_question_notification', '', false)`);
    }
    const failedQuestion = await db.query<{ id: string }>(
      `select id::text from public.broadcast_questions where idempotency_key = 'delivery-fails'`
    );
    assert.equal(failedQuestion.rows.length, 0);
    const failedNotice = await db.query<{ id: string }>(
      `select id::text from public.notifications where body = 'המשלוח ייכשל'`
    );
    assert.equal(failedNotice.rows.length, 0);
    const afterFailure = await db.query<{ count: string }>(
      `select count(*)::text as count from public.broadcast_questions`
    );
    assert.equal(afterFailure.rows[0]?.count, beforeFailure.rows[0]?.count);

    const regularAfterDelivery = await db.query<{ result: unknown }>(
      `select public.admin_send_in_app_broadcast('parents', 't', 'b', null, null, 'k') as result`
    );
    assert.equal(asJson(regularAfterDelivery.rows[0]?.result).marker, "regular-broadcast-unchanged");

    console.log("broadcast v2 question schema tests passed");
  } finally {
    await db.close();
  }
}

type SendInput = {
  audience: string;
  prompt: string;
  format: string;
  mode: string;
  options: string[];
  key: string;
  isTest: boolean;
  testUser: string | null;
};

async function send(db: PGlite, input: SendInput): Promise<Record<string, unknown>> {
  return asRole(db, "service_role", null, async () => {
    const result = await db.query<{ result: unknown }>(
      `select public.admin_send_broadcast_question($1, $2, $3, $4, $5, $6, $7, $8) as result`,
      [
        input.audience,
        input.prompt,
        input.format,
        input.mode,
        input.options,
        input.key,
        input.isTest,
        input.testUser
      ]
    );
    return asJson(result.rows[0]?.result);
  });
}

async function submit(
  db: PGlite,
  userId: string,
  questionId: string,
  optionIdsToSave: string[]
): Promise<Record<string, unknown>> {
  return asRole(db, "authenticated", userId, async () => {
    const result = await db.query<{ result: unknown }>(
      `select public.submit_broadcast_question_response($1, $2::uuid[]) as result`,
      [questionId, optionIdsToSave]
    );
    return asJson(result.rows[0]?.result);
  });
}

async function asRole<T>(
  db: PGlite,
  role: "authenticated" | "service_role",
  userId: string | null,
  run: () => Promise<T>
): Promise<T> {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`
  );
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec(`reset role`);
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

async function assertDelivery(
  db: PGlite,
  questionId: string,
  userIds: string[],
  expected: { isTest: boolean; title: string; body: string }
): Promise<void> {
  const result = await db.query<{
    user_id: string;
    kind: string;
    title: string;
    body: string;
    dedupe_key: string;
    question_id: string;
    broadcast_id: string;
    is_test: boolean;
  }>(
    `select user_id::text,
            kind,
            title,
            body,
            dedupe_key,
            payload->>'question_id' as question_id,
            payload->>'broadcast_id' as broadcast_id,
            (payload->>'is_test')::boolean as is_test
     from public.notifications
     where dedupe_key = $1
     order by user_id`,
    [questionId]
  );
  assert.deepEqual(
    result.rows.map((row) => row.user_id),
    [...userIds].sort()
  );
  for (const row of result.rows) {
    assert.equal(row.kind, "admin_broadcast");
    assert.equal(row.question_id, questionId);
    assert.equal(row.broadcast_id, questionId);
    assert.equal(row.dedupe_key, questionId);
    assert.equal(row.is_test, expected.isTest);
    assert.equal(row.title, expected.title);
    assert.equal(row.body, expected.body);
    assert.equal(row.title.length <= 80, true);
  }
}

function asOptions(value: unknown): Array<{ id: string; label: string; position: number }> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown[]) : (value as unknown[]);
  return parsed.map((item) => {
    const row = item as { id: string; label: string; position: number };
    return { id: String(row.id), label: String(row.label), position: Number(row.position) };
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
