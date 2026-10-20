-- Broadcast V2 questions.
-- Additive. Does not replace admin_broadcast_recipient_ids, admin_send_in_app_broadcast,
-- admin_broadcasts, or the notifications table definition.
-- A successful question send inserts one admin_broadcast notification per snapshotted
-- recipient in the same transaction. It does not send Web Push, SMS, or email.
--
-- Audience membership is resolved only by calling admin_broadcast_recipient_ids.
-- The allowlist below checks the argument. It does not decide who is a parent,
-- sitter, verified user, or marketing opt-in.
--
-- Recipients are copied at send time. Later profile changes do not change who
-- may answer or who a campaign report counts.
-- Responses store the user's current selection. Replace is one transaction:
-- delete that user's rows for the question, then insert the new option set.
-- first_responded_at stays on the first save. There is no follow-up automation.

-- ---------------------------------------------------------------------------
-- 1. Questions, options, send-time recipients, current responses
-- ---------------------------------------------------------------------------
create table if not exists public.broadcast_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  admin_actor text not null default 'admin_dashboard',
  audience_type text not null,
  question_format text not null,
  selection_mode text not null,
  prompt text not null,
  recipient_count integer not null default 0,
  idempotency_key text not null,
  is_test boolean not null default false,
  constraint broadcast_questions_admin_actor_chk
    check (admin_actor = 'admin_dashboard'),
  constraint broadcast_questions_audience_type_chk
    check (
      audience_type in (
        'all_users',
        'parents',
        'sitters',
        'identity_unverified',
        'identity_verified',
        'profile_incomplete',
        'profile_complete',
        'rp_marketing_opt_in',
        'ran_marketing_opt_in'
      )
    ),
  constraint broadcast_questions_format_chk
    check (question_format in ('yes_no', 'custom')),
  constraint broadcast_questions_selection_mode_chk
    check (selection_mode in ('single', 'multiple')),
  constraint broadcast_questions_yes_no_single_chk
    check (question_format <> 'yes_no' or selection_mode = 'single'),
  constraint broadcast_questions_prompt_chk
    check (
      char_length(prompt) between 1 and 2000
      and prompt = btrim(prompt)
      and prompt !~ '[<>]'
    ),
  constraint broadcast_questions_recipient_count_chk
    check (recipient_count >= 0),
  constraint broadcast_questions_idempotency_key_chk
    check (
      char_length(idempotency_key) between 1 and 80
      and idempotency_key ~ '^[A-Za-z0-9:_-]+$'
    )
);

create unique index if not exists broadcast_questions_idempotency_key_uidx
  on public.broadcast_questions (idempotency_key);

create index if not exists broadcast_questions_real_campaigns_idx
  on public.broadcast_questions (created_at desc)
  where is_test = false;

create index if not exists broadcast_questions_audience_idx
  on public.broadcast_questions (audience_type)
  where is_test = false;

comment on table public.broadcast_questions is
  'Interactive broadcast questions. is_test rows are practice sends and stay out of campaign reporting. recipient_count is the send-time total and is not rewritten when a user account is later deleted.';

comment on column public.broadcast_questions.closed_at is
  'Null while answers are accepted. Set by admin_close_broadcast_question.';

comment on column public.broadcast_questions.audience_type is
  'Audience chosen by the admin. Who actually received the question is broadcast_question_recipients, not a fresh read of profiles.';

comment on column public.broadcast_questions.is_test is
  'True when the send was a one-user practice question. Exclude these from campaign totals.';

create table if not exists public.broadcast_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.broadcast_questions (id) on delete cascade,
  label text not null,
  position integer not null,
  constraint broadcast_question_options_label_chk
    check (
      char_length(label) between 1 and 80
      and label = btrim(label)
      and label !~ '[<>]'
      and position(E'\n' in label) = 0
      and position(E'\r' in label) = 0
    ),
  constraint broadcast_question_options_position_chk
    check (position between 1 and 12),
  constraint broadcast_question_options_question_position_key
    unique (question_id, position),
  constraint broadcast_question_options_question_label_key
    unique (question_id, label),
  constraint broadcast_question_options_question_id_key
    unique (question_id, id)
);

create index if not exists broadcast_question_options_question_idx
  on public.broadcast_question_options (question_id, position);

comment on table public.broadcast_question_options is
  'Answer choices. Yes/No is two rows with question_format = yes_no, not a separate answer type. Options freeze once recipients are snapshotted.';

create table if not exists public.broadcast_question_recipients (
  question_id uuid not null references public.broadcast_questions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  first_responded_at timestamptz,
  last_responded_at timestamptz,
  primary key (question_id, user_id)
);

create index if not exists broadcast_question_recipients_user_idx
  on public.broadcast_question_recipients (user_id, question_id);

comment on table public.broadcast_question_recipients is
  'Send-time recipient snapshot. Real campaigns copy admin_broadcast_recipient_ids. Test questions store only the single practice user. Answering checks this table, not the live profile.';

comment on column public.broadcast_question_recipients.first_responded_at is
  'When this recipient first saved an answer. Unchanged when they replace that answer.';

comment on column public.broadcast_question_recipients.last_responded_at is
  'When this recipient last replaced their answer.';

create table if not exists public.broadcast_question_responses (
  question_id uuid not null,
  user_id uuid not null,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (question_id, user_id, option_id),
  constraint broadcast_question_responses_recipient_fk
    foreign key (question_id, user_id)
    references public.broadcast_question_recipients (question_id, user_id)
    on delete cascade,
  constraint broadcast_question_responses_option_fk
    foreign key (question_id, option_id)
    references public.broadcast_question_options (question_id, id)
    on delete cascade
);

create index if not exists broadcast_question_responses_user_idx
  on public.broadcast_question_responses (user_id, question_id);

create index if not exists broadcast_question_responses_option_idx
  on public.broadcast_question_responses (option_id);

comment on table public.broadcast_question_responses is
  'Current selection only: one row per chosen option. Segment later with select user_id from broadcast_question_responses where option_id = .... No campaign or automation tables.';

comment on column public.broadcast_question_responses.created_at is
  'First time this recipient answered the question. Copied onto the replacement rows so the original time stays on the current selection.';

comment on column public.broadcast_question_responses.updated_at is
  'When the current selection was saved.';

-- ---------------------------------------------------------------------------
-- 2. RLS. Authenticated users can read their own rows. Writes go through RPCs.
--    RLS is not forced: the security-definer RPCs run as the table owner.
--    Forcing it would block those writes. Authenticated has no write grant.
-- ---------------------------------------------------------------------------
alter table public.broadcast_questions enable row level security;
alter table public.broadcast_question_options enable row level security;
alter table public.broadcast_question_recipients enable row level security;
alter table public.broadcast_question_responses enable row level security;

drop policy if exists broadcast_questions_select_own on public.broadcast_questions;
create policy broadcast_questions_select_own
  on public.broadcast_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.broadcast_question_recipients r
      where r.question_id = broadcast_questions.id
        and r.user_id = (select auth.uid())
    )
  );

drop policy if exists broadcast_question_options_select_own on public.broadcast_question_options;
create policy broadcast_question_options_select_own
  on public.broadcast_question_options
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.broadcast_question_recipients r
      where r.question_id = broadcast_question_options.question_id
        and r.user_id = (select auth.uid())
    )
  );

drop policy if exists broadcast_question_recipients_select_own on public.broadcast_question_recipients;
create policy broadcast_question_recipients_select_own
  on public.broadcast_question_recipients
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists broadcast_question_responses_select_own on public.broadcast_question_responses;
create policy broadcast_question_responses_select_own
  on public.broadcast_question_responses
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.broadcast_questions from public;
revoke all on table public.broadcast_questions from anon;
revoke all on table public.broadcast_questions from authenticated;
grant select on table public.broadcast_questions to authenticated;
grant select on table public.broadcast_questions to service_role;

revoke all on table public.broadcast_question_options from public;
revoke all on table public.broadcast_question_options from anon;
revoke all on table public.broadcast_question_options from authenticated;
grant select on table public.broadcast_question_options to authenticated;
grant select on table public.broadcast_question_options to service_role;

revoke all on table public.broadcast_question_recipients from public;
revoke all on table public.broadcast_question_recipients from anon;
revoke all on table public.broadcast_question_recipients from authenticated;
grant select on table public.broadcast_question_recipients to authenticated;
grant select on table public.broadcast_question_recipients to service_role;

revoke all on table public.broadcast_question_responses from public;
revoke all on table public.broadcast_question_responses from anon;
revoke all on table public.broadcast_question_responses from authenticated;
grant select on table public.broadcast_question_responses to authenticated;
grant select on table public.broadcast_question_responses to service_role;

-- ---------------------------------------------------------------------------
-- 3. Validation helper and guards
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_question_plain_text(p_value text, p_max integer)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if v_text is null then
    raise exception 'plain text is required' using errcode = '22023';
  end if;
  if char_length(v_text) > p_max then
    raise exception 'plain text is too long' using errcode = '22023';
  end if;
  if v_text ~ '[<>]' then
    raise exception 'plain text only' using errcode = '22023';
  end if;
  return v_text;
end;
$$;

create or replace function public.broadcast_questions_freeze_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.broadcast_question_recipients r
    where r.question_id = old.id
  ) then
    return new;
  end if;

  if new.prompt is distinct from old.prompt
     or new.question_format is distinct from old.question_format
     or new.selection_mode is distinct from old.selection_mode
     or new.audience_type is distinct from old.audience_type
     or new.is_test is distinct from old.is_test
     or new.idempotency_key is distinct from old.idempotency_key
     or new.admin_actor is distinct from old.admin_actor
     or new.created_at is distinct from old.created_at
  then
    raise exception 'question content is fixed once recipients are snapshotted'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function public.broadcast_question_options_freeze()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_question_id uuid := coalesce(new.question_id, old.question_id);
begin
  if exists (
    select 1
    from public.broadcast_question_recipients r
    where r.question_id = v_question_id
  ) then
    raise exception 'options are fixed once recipients are snapshotted'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.broadcast_question_assert_option_count()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_question_id uuid;
  v_format text;
  v_count integer;
begin
  if tg_table_name = 'broadcast_questions' then
    v_question_id := coalesce(new.id, old.id);
  else
    v_question_id := coalesce(new.question_id, old.question_id);
  end if;

  select q.question_format
    into v_format
    from public.broadcast_questions q
   where q.id = v_question_id;

  if v_format is null then
    return null;
  end if;

  select count(*)::integer
    into v_count
    from public.broadcast_question_options o
   where o.question_id = v_question_id;

  if v_format = 'yes_no' and v_count <> 2 then
    raise exception 'yes_no questions require exactly two options'
      using errcode = '22023';
  end if;

  if v_format = 'custom' and (v_count < 2 or v_count > 12) then
    raise exception 'custom questions require between 2 and 12 options'
      using errcode = '22023';
  end if;

  return null;
end;
$$;

create or replace function public.broadcast_question_responses_enforce_single()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mode text;
  v_count integer;
begin
  select q.selection_mode
    into v_mode
    from public.broadcast_questions q
   where q.id = new.question_id;

  if v_mode is distinct from 'single' then
    return null;
  end if;

  select count(*)::integer
    into v_count
    from public.broadcast_question_responses r
   where r.question_id = new.question_id
     and r.user_id = new.user_id;

  if v_count > 1 then
    raise exception 'single-choice questions accept one option'
      using errcode = '22023';
  end if;

  return null;
end;
$$;

drop trigger if exists broadcast_questions_freeze_content on public.broadcast_questions;
create trigger broadcast_questions_freeze_content
  before update on public.broadcast_questions
  for each row
  execute function public.broadcast_questions_freeze_content();

drop trigger if exists broadcast_question_options_freeze on public.broadcast_question_options;
create trigger broadcast_question_options_freeze
  before insert or update or delete on public.broadcast_question_options
  for each row
  execute function public.broadcast_question_options_freeze();

drop trigger if exists broadcast_questions_assert_option_count on public.broadcast_questions;
create constraint trigger broadcast_questions_assert_option_count
  after insert on public.broadcast_questions
  deferrable initially deferred
  for each row
  execute function public.broadcast_question_assert_option_count();

drop trigger if exists broadcast_question_options_assert_count on public.broadcast_question_options;
create constraint trigger broadcast_question_options_assert_count
  after insert or update or delete on public.broadcast_question_options
  deferrable initially deferred
  for each row
  execute function public.broadcast_question_assert_option_count();

drop trigger if exists broadcast_question_responses_enforce_single on public.broadcast_question_responses;
create trigger broadcast_question_responses_enforce_single
  after insert on public.broadcast_question_responses
  for each row
  execute function public.broadcast_question_responses_enforce_single();

-- ---------------------------------------------------------------------------
-- 4. Send. Service role only. Real recipients come from the existing function.
-- ---------------------------------------------------------------------------
create or replace function public.admin_send_broadcast_question(
  p_audience text,
  p_prompt text,
  p_question_format text,
  p_selection_mode text,
  p_options text[],
  p_idempotency_key text,
  p_is_test boolean default false,
  p_test_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.broadcast_questions%rowtype;
  v_question_id uuid;
  v_prompt text;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_is_test boolean := coalesce(p_is_test, false);
  v_option_count integer := coalesce(cardinality(p_options), 0);
  v_option record;
  v_label text;
  v_seen text[] := '{}';
  v_count integer := 0;
  v_notified integer := 0;
  v_options jsonb;
begin
  if p_audience not in (
    'all_users',
    'parents',
    'sitters',
    'identity_unverified',
    'identity_verified',
    'profile_incomplete',
    'profile_complete',
    'rp_marketing_opt_in',
    'ran_marketing_opt_in'
  ) then
    raise exception 'invalid audience' using errcode = '22023';
  end if;

  if p_question_format not in ('yes_no', 'custom') then
    raise exception 'invalid question format' using errcode = '22023';
  end if;

  if p_selection_mode not in ('single', 'multiple') then
    raise exception 'invalid selection mode' using errcode = '22023';
  end if;

  if p_question_format = 'yes_no' and p_selection_mode <> 'single' then
    raise exception 'yes_no questions are single-choice' using errcode = '22023';
  end if;

  if p_question_format = 'yes_no' and v_option_count <> 2 then
    raise exception 'yes_no questions require exactly two options' using errcode = '22023';
  end if;

  if p_question_format = 'custom' and (v_option_count < 2 or v_option_count > 12) then
    raise exception 'custom questions require between 2 and 12 options' using errcode = '22023';
  end if;

  v_prompt := public.broadcast_question_plain_text(p_prompt, 2000);

  if v_key is null
     or char_length(v_key) > 80
     or v_key !~ '^[A-Za-z0-9:_-]+$'
  then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  if v_is_test then
    if p_test_user_id is null then
      raise exception 'test user is required' using errcode = '22023';
    end if;
    if not exists (select 1 from auth.users u where u.id = p_test_user_id) then
      raise exception 'test user was not found' using errcode = 'P0002';
    end if;
  elsif p_test_user_id is not null then
    raise exception 'test user is only valid for test questions' using errcode = '22023';
  end if;

  select *
    into v_existing
    from public.broadcast_questions
   where idempotency_key = v_key;

  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'position', o.position
        )
        order by o.position
      ),
      '[]'::jsonb
    )
      into v_options
      from public.broadcast_question_options o
     where o.question_id = v_existing.id;

    return jsonb_build_object(
      'question_id', v_existing.id,
      'recipient_count', v_existing.recipient_count,
      'already_sent', true,
      'is_test', v_existing.is_test,
      'options', v_options
    );
  end if;

  insert into public.broadcast_questions (
    admin_actor,
    audience_type,
    question_format,
    selection_mode,
    prompt,
    recipient_count,
    idempotency_key,
    is_test
  )
  values (
    'admin_dashboard',
    p_audience,
    p_question_format,
    p_selection_mode,
    v_prompt,
    0,
    v_key,
    v_is_test
  )
  returning id into v_question_id;

  for v_option in
    select u.label as raw_label, u.ordinality::integer as position
    from unnest(p_options) with ordinality as u(label, ordinality)
  loop
    v_label := public.broadcast_question_plain_text(v_option.raw_label, 80);
    if position(E'\n' in v_label) > 0 or position(E'\r' in v_label) > 0 then
      raise exception 'option labels must be one line' using errcode = '22023';
    end if;
    if v_label = any (v_seen) then
      raise exception 'duplicate option label' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_label);
    insert into public.broadcast_question_options (question_id, label, position)
    values (v_question_id, v_label, v_option.position);
  end loop;

  if v_is_test then
    insert into public.broadcast_question_recipients (question_id, user_id)
    values (v_question_id, p_test_user_id);
  else
    insert into public.broadcast_question_recipients (question_id, user_id)
    select distinct v_question_id, r.user_id
    from public.admin_broadcast_recipient_ids(p_audience) r
    where r.user_id is not null;
  end if;

  update public.broadcast_questions q
     set recipient_count = (
       select count(*)::integer
       from public.broadcast_question_recipients r
       where r.question_id = q.id
     )
   where q.id = v_question_id
  returning q.recipient_count into v_count;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    payload,
    dedupe_key
  )
  select
    r.user_id,
    'admin_broadcast',
    left(v_prompt, 80),
    v_prompt,
    jsonb_build_object(
      'question_id', v_question_id,
      'broadcast_id', v_question_id,
      'is_test', v_is_test
    ),
    v_question_id::text
  from public.broadcast_question_recipients r
  where r.question_id = v_question_id
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
  do nothing;

  select count(*)::integer
    into v_notified
    from public.notifications n
   where n.kind = 'admin_broadcast'
     and n.dedupe_key = v_question_id::text;

  if v_notified is distinct from v_count then
    raise exception 'notification delivery incomplete' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'label', o.label,
        'position', o.position
      )
      order by o.position
    ),
    '[]'::jsonb
  )
    into v_options
    from public.broadcast_question_options o
   where o.question_id = v_question_id;

  return jsonb_build_object(
    'question_id', v_question_id,
    'recipient_count', v_count,
    'already_sent', false,
    'is_test', v_is_test,
    'options', v_options
  );
exception
  when unique_violation then
    select *
      into v_existing
      from public.broadcast_questions
     where idempotency_key = v_key;
    if found then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'label', o.label,
            'position', o.position
          )
          order by o.position
        ),
        '[]'::jsonb
      )
        into v_options
        from public.broadcast_question_options o
       where o.question_id = v_existing.id;

      return jsonb_build_object(
        'question_id', v_existing.id,
        'recipient_count', v_existing.recipient_count,
        'already_sent', true,
        'is_test', v_existing.is_test,
        'options', v_options
      );
    end if;
    raise;
end;
$$;

create or replace function public.admin_close_broadcast_question(p_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed timestamptz;
begin
  select q.closed_at
    into v_closed
    from public.broadcast_questions q
   where q.id = p_question_id
   for update;

  if not found then
    raise exception 'question was not found' using errcode = 'P0002';
  end if;

  if v_closed is not null then
    return jsonb_build_object(
      'question_id', p_question_id,
      'closed_at', v_closed,
      'already_closed', true
    );
  end if;

  update public.broadcast_questions
     set closed_at = now()
   where id = p_question_id
  returning closed_at into v_closed;

  return jsonb_build_object(
    'question_id', p_question_id,
    'closed_at', v_closed,
    'already_closed', false
  );
end;
$$;

-- The caller's auth.uid() is the only user id. There is no user-id argument.
create or replace function public.submit_broadcast_question_response(
  p_question_id uuid,
  p_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_closed timestamptz;
  v_mode text;
  v_first timestamptz;
  v_saved_at timestamptz := now();
  v_count integer := coalesce(cardinality(p_option_ids), 0);
  v_distinct integer;
  v_option_ids jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_question_id is null or p_option_ids is null or v_count < 1 then
    raise exception 'at least one option is required' using errcode = '22023';
  end if;

  if v_count > 12 then
    raise exception 'too many options' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_option_ids) as option_id
    where option_id is null
  ) then
    raise exception 'invalid option' using errcode = '22023';
  end if;

  select count(distinct option_id)::integer
    into v_distinct
    from unnest(p_option_ids) as option_id;

  if v_distinct <> v_count then
    raise exception 'duplicate option' using errcode = '22023';
  end if;

  select q.closed_at, q.selection_mode
    into v_closed, v_mode
    from public.broadcast_questions q
   where q.id = p_question_id
   for share;

  if not found then
    raise exception 'question was not found' using errcode = 'P0002';
  end if;

  if v_closed is not null then
    raise exception 'question is closed' using errcode = '55000';
  end if;

  if v_mode = 'single' and v_count <> 1 then
    raise exception 'single-choice questions accept one option' using errcode = '22023';
  end if;

  select r.first_responded_at
    into v_first
    from public.broadcast_question_recipients r
   where r.question_id = p_question_id
     and r.user_id = v_user
   for update;

  if not found then
    raise exception 'not a recipient' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(p_option_ids) as picked(option_id)
    where not exists (
      select 1
      from public.broadcast_question_options o
      where o.id = picked.option_id
        and o.question_id = p_question_id
    )
  ) then
    raise exception 'invalid option' using errcode = '22023';
  end if;

  delete from public.broadcast_question_responses
   where question_id = p_question_id
     and user_id = v_user;

  insert into public.broadcast_question_responses (
    question_id,
    user_id,
    option_id,
    created_at,
    updated_at
  )
  select
    p_question_id,
    v_user,
    picked.option_id,
    coalesce(v_first, v_saved_at),
    v_saved_at
  from unnest(p_option_ids) as picked(option_id);

  update public.broadcast_question_recipients
     set first_responded_at = coalesce(first_responded_at, v_saved_at),
         last_responded_at = v_saved_at
   where question_id = p_question_id
     and user_id = v_user;

  select coalesce(jsonb_agg(o.id order by o.position), '[]'::jsonb)
    into v_option_ids
    from public.broadcast_question_responses resp
    join public.broadcast_question_options o on o.id = resp.option_id
   where resp.question_id = p_question_id
     and resp.user_id = v_user;

  return jsonb_build_object(
    'question_id', p_question_id,
    'option_ids', v_option_ids,
    'replaced', v_first is not null
  );
end;
$$;

revoke all on function public.broadcast_question_plain_text(text, integer) from public;
revoke all on function public.broadcast_question_plain_text(text, integer) from anon;
revoke all on function public.broadcast_question_plain_text(text, integer) from authenticated;
revoke all on function public.broadcast_question_plain_text(text, integer) from service_role;

revoke all on function public.broadcast_questions_freeze_content() from public;
revoke all on function public.broadcast_questions_freeze_content() from anon;
revoke all on function public.broadcast_questions_freeze_content() from authenticated;
revoke all on function public.broadcast_question_options_freeze() from public;
revoke all on function public.broadcast_question_options_freeze() from anon;
revoke all on function public.broadcast_question_options_freeze() from authenticated;
revoke all on function public.broadcast_question_assert_option_count() from public;
revoke all on function public.broadcast_question_assert_option_count() from anon;
revoke all on function public.broadcast_question_assert_option_count() from authenticated;
revoke all on function public.broadcast_question_responses_enforce_single() from public;
revoke all on function public.broadcast_question_responses_enforce_single() from anon;
revoke all on function public.broadcast_question_responses_enforce_single() from authenticated;

revoke all on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid) from public;
revoke all on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid) from anon;
revoke all on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid) from authenticated;
grant execute on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid) to service_role;

revoke all on function public.admin_close_broadcast_question(uuid) from public;
revoke all on function public.admin_close_broadcast_question(uuid) from anon;
revoke all on function public.admin_close_broadcast_question(uuid) from authenticated;
grant execute on function public.admin_close_broadcast_question(uuid) to service_role;

revoke all on function public.submit_broadcast_question_response(uuid, uuid[]) from public;
revoke all on function public.submit_broadcast_question_response(uuid, uuid[]) from anon;
revoke all on function public.submit_broadcast_question_response(uuid, uuid[]) from service_role;
grant execute on function public.submit_broadcast_question_response(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
