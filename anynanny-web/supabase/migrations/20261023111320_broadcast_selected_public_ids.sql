-- Selected public-id recipients for ordinary Admin Broadcast and Broadcast V2 questions.
-- Additive. Does not replace admin_broadcast_recipient_ids, admin_count_broadcast_recipients,
-- admin_send_in_app_broadcast, or admin_send_broadcast_question.
-- A selected send never calls the broad audience resolver and has no audience argument
-- that could fall back to all_users.
--
-- Public ids are resolved from profiles.parent_serial and profiles.nanny_serial.
-- profiles.public_id is not a lookup column.
-- The id list stored on the campaign is the canonical public ids, not auth UUIDs,
-- emails, or phone numbers. Question recipients cannot select that column.

alter table public.admin_broadcasts
  add column if not exists selected_public_ids text[];

alter table public.admin_broadcasts
  drop constraint if exists admin_broadcasts_audience_type_check;

alter table public.admin_broadcasts
  add constraint admin_broadcasts_audience_type_check
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
      'ran_marketing_opt_in',
      'selected_public_ids'
    )
  );

alter table public.admin_broadcasts
  drop constraint if exists admin_broadcasts_selected_public_ids_check;

alter table public.admin_broadcasts
  add constraint admin_broadcasts_selected_public_ids_check
  check (
    (
      audience_type = 'selected_public_ids'
      and selected_public_ids is not null
      and cardinality(selected_public_ids) between 1 and 50
    )
    or (
      audience_type <> 'selected_public_ids'
      and selected_public_ids is null
    )
  );

comment on column public.admin_broadcasts.selected_public_ids is
  'Canonical public ids for a selected_public_ids send. Null for every predefined audience. Not emails, phones, or auth UUIDs.';

alter table public.broadcast_questions
  add column if not exists selected_public_ids text[];

alter table public.broadcast_questions
  drop constraint if exists broadcast_questions_audience_type_chk;

alter table public.broadcast_questions
  add constraint broadcast_questions_audience_type_chk
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
      'ran_marketing_opt_in',
      'selected_public_ids'
    )
  );

alter table public.broadcast_questions
  drop constraint if exists broadcast_questions_selected_public_ids_chk;

alter table public.broadcast_questions
  add constraint broadcast_questions_selected_public_ids_chk
  check (
    (
      audience_type = 'selected_public_ids'
      and selected_public_ids is not null
      and cardinality(selected_public_ids) between 1 and 50
    )
    or (
      audience_type <> 'selected_public_ids'
      and selected_public_ids is null
    )
  );

comment on column public.broadcast_questions.selected_public_ids is
  'Canonical public ids for a selected_public_ids question. Null for every predefined audience. Hidden from authenticated recipients.';

revoke select on table public.broadcast_questions from authenticated;

grant select (
  id,
  created_at,
  closed_at,
  admin_actor,
  audience_type,
  question_format,
  selection_mode,
  prompt,
  recipient_count,
  idempotency_key,
  is_test
) on table public.broadcast_questions to authenticated;

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
     or new.selected_public_ids is distinct from old.selected_public_ids
  then
    raise exception 'question content is fixed once recipients are snapshotted'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.broadcast_questions_freeze_content() from public;
revoke all on function public.broadcast_questions_freeze_content() from anon;
revoke all on function public.broadcast_questions_freeze_content() from authenticated;

-- Internal resolver. Returns auth ids to the table owner only.
-- Preview and send functions do not return those ids to the caller.

create or replace function public.admin_selected_broadcast_matches(p_public_ids text[])
returns table (
  ordinal integer,
  public_id text,
  user_id uuid,
  role text,
  reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw text;
  v_id text;
  v_ordinal integer := 0;
  v_seen text[] := '{}';
  v_seen_users uuid[] := '{}';
  v_count integer;
  v_profile_id uuid;
  v_role text;
  v_suspended timestamptz;
  v_mirror uuid;
begin
  if p_public_ids is null or cardinality(p_public_ids) = 0 then
    ordinal := 0;
    public_id := null;
    user_id := null;
    role := null;
    reason := 'empty';
    return next;
    return;
  end if;

  if cardinality(p_public_ids) > 50 then
    ordinal := 0;
    public_id := null;
    user_id := null;
    role := null;
    reason := 'too_many';
    return next;
    return;
  end if;

  foreach v_raw in array p_public_ids loop
    v_ordinal := v_ordinal + 1;
    v_id := upper(btrim(coalesce(v_raw, '')));
    ordinal := v_ordinal;
    public_id := nullif(v_id, '');
    user_id := null;
    role := null;
    reason := null;
    v_profile_id := null;
    v_role := null;
    v_suspended := null;
    v_mirror := null;

    if v_id !~ '^(RP|P|RAN|AN|CONS)-[0-9]+$' then
      reason := 'invalid';
      return next;
      continue;
    end if;

    if v_id = any (v_seen) then
      reason := 'duplicate';
      return next;
      continue;
    end if;
    v_seen := array_append(v_seen, v_id);

    if v_id ~ '^(RP|P)-[0-9]+$' then
      select count(*)::integer
        into v_count
        from public.profiles p
       where upper(btrim(coalesce(p.parent_serial, ''))) = v_id;

      if v_count = 0 then
        reason := 'unknown';
        return next;
        continue;
      elsif v_count > 1 then
        reason := 'ambiguous';
        return next;
        continue;
      end if;

      select p.id, p.role, p.suspended_at
        into v_profile_id, v_role, v_suspended
        from public.profiles p
       where upper(btrim(coalesce(p.parent_serial, ''))) = v_id;

      if v_role is distinct from 'parent' then
        reason := 'role_mismatch';
        return next;
        continue;
      end if;
    else
      select count(*)::integer
        into v_count
        from public.profiles p
       where upper(btrim(coalesce(p.nanny_serial, ''))) = v_id;

      if v_count = 0 then
        reason := 'unknown';
        return next;
        continue;
      elsif v_count > 1 then
        reason := 'ambiguous';
        return next;
        continue;
      end if;

      select p.id, p.role, p.suspended_at
        into v_profile_id, v_role, v_suspended
        from public.profiles p
       where upper(btrim(coalesce(p.nanny_serial, ''))) = v_id;

      if v_role is distinct from 'sitter' then
        reason := 'role_mismatch';
        return next;
        continue;
      end if;

      select count(*)::integer
        into v_count
        from public.sitter_profiles sp
       where upper(btrim(coalesce(sp.nanny_serial, ''))) = v_id;

      if v_count > 1 then
        reason := 'ambiguous';
        return next;
        continue;
      elsif v_count = 1 then
        select sp.id
          into v_mirror
          from public.sitter_profiles sp
         where upper(btrim(coalesce(sp.nanny_serial, ''))) = v_id;
        if v_mirror is distinct from v_profile_id then
          reason := 'ambiguous';
          return next;
          continue;
        end if;
      end if;
    end if;

    if v_suspended is not null or not exists (
      select 1
        from auth.users u
       where u.id = v_profile_id
         and u.deleted_at is null
         and (u.banned_until is null or u.banned_until <= now())
    ) then
      reason := 'inactive';
      return next;
      continue;
    end if;

    if v_profile_id = any (v_seen_users) then
      reason := 'duplicate';
      return next;
      continue;
    end if;
    v_seen_users := array_append(v_seen_users, v_profile_id);

    user_id := v_profile_id;
    role := v_role;
    reason := null;
    return next;
  end loop;
end;
$$;

create or replace function public.admin_preview_selected_broadcast_recipients(p_public_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_batch text;
  v_entries jsonb;
  v_valid integer;
begin
  select m.reason
    into v_batch
    from public.admin_selected_broadcast_matches(p_public_ids) m
   where m.reason in ('empty', 'too_many')
   limit 1;

  if v_batch is not null then
    return jsonb_build_object(
      'ok', false,
      'recipient_count', 0,
      'error', v_batch,
      'entries', '[]'::jsonb
    );
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'public_id', m.public_id,
            'role', m.role,
            'ok', m.reason is null,
            'reason', m.reason
          )
        )
        order by m.ordinal
      ),
      '[]'::jsonb
    ),
    count(*) filter (where m.reason is null)::integer
    into v_entries, v_valid
    from public.admin_selected_broadcast_matches(p_public_ids) m;

  return jsonb_build_object(
    'ok', v_valid = cardinality(p_public_ids) and v_valid > 0,
    'recipient_count', v_valid,
    'error', null,
    'entries', v_entries
  );
end;
$$;

create or replace function public.admin_send_selected_in_app_broadcast(
  p_public_ids text[],
  p_title text,
  p_body text,
  p_cta_label text,
  p_cta_route text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast_id uuid;
  v_count integer := 0;
  v_expected integer := 0;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_ids text[];
  v_existing public.admin_broadcasts%rowtype;
begin
  if v_title is null or v_body is null then
    raise exception 'title and body are required' using errcode = '22023';
  end if;
  if char_length(v_title) > 80 or char_length(v_body) > 2000 then
    raise exception 'title or body too long' using errcode = '22023';
  end if;
  if v_title ~ '[<>]' or v_body ~ '[<>]' then
    raise exception 'plain text only' using errcode = '22023';
  end if;
  if v_key is null or char_length(v_key) > 80 or v_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  select *
    into v_existing
    from public.admin_broadcasts
   where idempotency_key = v_key;

  if found then
    return jsonb_build_object(
      'broadcast_id', v_existing.id,
      'recipient_count', v_existing.recipient_count,
      'already_sent', true
    );
  end if;

  if exists (
    select 1
      from public.admin_selected_broadcast_matches(p_public_ids) m
     where m.reason is not null
        or m.user_id is null
  ) then
    raise exception 'selected recipients are invalid' using errcode = '22023';
  end if;

  select count(*)::integer, coalesce(array_agg(m.public_id order by m.ordinal), '{}'::text[])
    into v_expected, v_ids
    from public.admin_selected_broadcast_matches(p_public_ids) m;

  if v_expected < 1 or v_expected is distinct from coalesce(cardinality(p_public_ids), 0) then
    raise exception 'selected recipients are invalid' using errcode = '22023';
  end if;

  insert into public.admin_broadcasts (
    admin_actor,
    audience_type,
    recipient_count,
    title,
    body,
    cta_label,
    cta_route,
    idempotency_key,
    selected_public_ids
  )
  values (
    'admin_dashboard',
    'selected_public_ids',
    0,
    v_title,
    v_body,
    nullif(btrim(coalesce(p_cta_label, '')), ''),
    nullif(btrim(coalesce(p_cta_route, '')), ''),
    v_key,
    v_ids
  )
  returning id into v_broadcast_id;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    payload,
    dedupe_key
  )
  select
    m.user_id,
    'admin_broadcast',
    v_title,
    v_body,
    jsonb_strip_nulls(
      jsonb_build_object(
        'broadcast_id', v_broadcast_id,
        'cta_route', nullif(btrim(coalesce(p_cta_route, '')), ''),
        'cta_label', nullif(btrim(coalesce(p_cta_label, '')), ''),
        'is_test', false
      )
    ),
    v_broadcast_id::text
  from public.admin_selected_broadcast_matches(p_public_ids) m
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
  do nothing;

  select count(*)::integer
    into v_count
    from public.notifications n
   where n.kind = 'admin_broadcast'
     and n.dedupe_key = v_broadcast_id::text;

  if v_count is distinct from v_expected then
    raise exception 'notification delivery incomplete' using errcode = 'P0001';
  end if;

  update public.admin_broadcasts
     set recipient_count = v_count
   where id = v_broadcast_id;

  return jsonb_build_object(
    'broadcast_id', v_broadcast_id,
    'recipient_count', v_count,
    'already_sent', false
  );
exception
  when unique_violation then
    select *
      into v_existing
      from public.admin_broadcasts
     where idempotency_key = v_key;
    if found then
      return jsonb_build_object(
        'broadcast_id', v_existing.id,
        'recipient_count', v_existing.recipient_count,
        'already_sent', true
      );
    end if;
    raise;
end;
$$;

create or replace function public.admin_send_selected_broadcast_question(
  p_public_ids text[],
  p_prompt text,
  p_question_format text,
  p_selection_mode text,
  p_options text[],
  p_idempotency_key text
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
  v_option_count integer := coalesce(cardinality(p_options), 0);
  v_option record;
  v_label text;
  v_seen text[] := '{}';
  v_count integer := 0;
  v_notified integer := 0;
  v_expected integer := 0;
  v_ids text[];
  v_options jsonb;
begin
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

  v_prompt := nullif(btrim(coalesce(p_prompt, '')), '');
  if v_prompt is null or char_length(v_prompt) > 2000 or v_prompt ~ '[<>]' then
    raise exception 'invalid prompt' using errcode = '22023';
  end if;
  if v_key is null or char_length(v_key) > 80 or v_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  select *
    into v_existing
    from public.broadcast_questions
   where idempotency_key = v_key;

  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', o.id, 'label', o.label, 'position', o.position)
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

  if exists (
    select 1
      from public.admin_selected_broadcast_matches(p_public_ids) m
     where m.reason is not null
        or m.user_id is null
  ) then
    raise exception 'selected recipients are invalid' using errcode = '22023';
  end if;

  select count(*)::integer, coalesce(array_agg(m.public_id order by m.ordinal), '{}'::text[])
    into v_expected, v_ids
    from public.admin_selected_broadcast_matches(p_public_ids) m;

  if v_expected < 1 or v_expected is distinct from coalesce(cardinality(p_public_ids), 0) then
    raise exception 'selected recipients are invalid' using errcode = '22023';
  end if;

  insert into public.broadcast_questions (
    admin_actor,
    audience_type,
    question_format,
    selection_mode,
    prompt,
    recipient_count,
    idempotency_key,
    is_test,
    selected_public_ids
  )
  values (
    'admin_dashboard',
    'selected_public_ids',
    p_question_format,
    p_selection_mode,
    v_prompt,
    0,
    v_key,
    false,
    v_ids
  )
  returning id into v_question_id;

  for v_option in
    select u.label as raw_label, u.ordinality::integer as position
    from unnest(p_options) with ordinality as u(label, ordinality)
  loop
    v_label := nullif(btrim(coalesce(v_option.raw_label, '')), '');
    if v_label is null
       or char_length(v_label) > 80
       or v_label ~ '[<>]'
       or position(E'\n' in v_label) > 0
       or position(E'\r' in v_label) > 0
    then
      raise exception 'invalid option' using errcode = '22023';
    end if;
    if v_label = any (v_seen) then
      raise exception 'duplicate option label' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_label);
    insert into public.broadcast_question_options (question_id, label, position)
    values (v_question_id, v_label, v_option.position);
  end loop;

  insert into public.broadcast_question_recipients (question_id, user_id)
  select v_question_id, m.user_id
    from public.admin_selected_broadcast_matches(p_public_ids) m;

  update public.broadcast_questions q
     set recipient_count = (
       select count(*)::integer
         from public.broadcast_question_recipients r
        where r.question_id = q.id
     )
   where q.id = v_question_id
  returning q.recipient_count into v_count;

  if v_count is distinct from v_expected then
    raise exception 'selected recipients are invalid' using errcode = '22023';
  end if;

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
      'is_test', false
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
      jsonb_build_object('id', o.id, 'label', o.label, 'position', o.position)
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
    'is_test', false,
    'options', v_options
  );
exception
  when unique_violation then
    select *
      into v_existing
      from public.broadcast_questions
     where idempotency_key = v_key;
    if found then
      return jsonb_build_object(
        'question_id', v_existing.id,
        'recipient_count', v_existing.recipient_count,
        'already_sent', true,
        'is_test', v_existing.is_test,
        'options', '[]'::jsonb
      );
    end if;
    raise;
end;
$$;

revoke all on function public.admin_selected_broadcast_matches(text[]) from public;
revoke all on function public.admin_selected_broadcast_matches(text[]) from anon;
revoke all on function public.admin_selected_broadcast_matches(text[]) from authenticated;
revoke all on function public.admin_selected_broadcast_matches(text[]) from service_role;

revoke all on function public.admin_preview_selected_broadcast_recipients(text[]) from public;
revoke all on function public.admin_preview_selected_broadcast_recipients(text[]) from anon;
revoke all on function public.admin_preview_selected_broadcast_recipients(text[]) from authenticated;
grant execute on function public.admin_preview_selected_broadcast_recipients(text[]) to service_role;

revoke all on function public.admin_send_selected_in_app_broadcast(text[], text, text, text, text, text) from public;
revoke all on function public.admin_send_selected_in_app_broadcast(text[], text, text, text, text, text) from anon;
revoke all on function public.admin_send_selected_in_app_broadcast(text[], text, text, text, text, text) from authenticated;
grant execute on function public.admin_send_selected_in_app_broadcast(text[], text, text, text, text, text) to service_role;

revoke all on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text) from public;
revoke all on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text) from anon;
revoke all on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text) from authenticated;
grant execute on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text) to service_role;

notify pgrst, 'reload schema';
