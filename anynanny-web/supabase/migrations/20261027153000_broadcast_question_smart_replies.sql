-- Optional automatic Nanny Talk after a recipient's first saved answer.
-- One personal notification for that user. Not a second mass broadcast.
-- Reply text is stored on the option row (by option id), never by display position.
-- Authenticated recipients cannot read the configuration or other answers' replies.

alter table public.broadcast_questions
  add column if not exists selected_public_ids text[];

alter table public.broadcast_questions
  add column if not exists smart_replies_enabled boolean not null default false;

alter table public.broadcast_questions
  add column if not exists smart_reply_mode text;

alter table public.broadcast_questions
  add column if not exists smart_reply_text text;

alter table public.broadcast_questions
  drop constraint if exists broadcast_questions_smart_reply_mode_chk;

alter table public.broadcast_questions
  add constraint broadcast_questions_smart_reply_mode_chk
  check (smart_reply_mode is null or smart_reply_mode in ('general', 'by_answer'));

alter table public.broadcast_questions
  drop constraint if exists broadcast_questions_smart_reply_shape_chk;

alter table public.broadcast_questions
  add constraint broadcast_questions_smart_reply_shape_chk
  check (
    (
      smart_replies_enabled = false
      and smart_reply_mode is null
      and smart_reply_text is null
    )
    or (
      smart_replies_enabled = true
      and smart_reply_mode = 'general'
      and smart_reply_text is not null
      and char_length(smart_reply_text) between 1 and 2000
      and smart_reply_text = btrim(smart_reply_text)
      and smart_reply_text !~ '[<>]'
    )
    or (
      smart_replies_enabled = true
      and smart_reply_mode = 'by_answer'
      and smart_reply_text is null
    )
  );

comment on column public.broadcast_questions.smart_replies_enabled is
  'When true, the first saved answer can create one personal Nanny Talk for that recipient.';

comment on column public.broadcast_questions.smart_reply_mode is
  'general: one message for every respondent. by_answer: the message is the selected option reply_text.';

comment on column public.broadcast_questions.smart_reply_text is
  'General smart-reply body. Null unless smart_reply_mode is general. Hidden from authenticated recipients.';

alter table public.broadcast_question_options
  add column if not exists reply_text text;

alter table public.broadcast_question_options
  drop constraint if exists broadcast_question_options_reply_text_chk;

alter table public.broadcast_question_options
  add constraint broadcast_question_options_reply_text_chk
  check (
    reply_text is null
    or (
      char_length(reply_text) between 1 and 2000
      and reply_text = btrim(reply_text)
      and reply_text !~ '[<>]'
    )
  );

comment on column public.broadcast_question_options.reply_text is
  'Personal reply for this answer option. Null when unused. Hidden from authenticated recipients.';

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

revoke select on table public.broadcast_question_options from authenticated;

grant select (
  id,
  question_id,
  label,
  position
) on table public.broadcast_question_options to authenticated;

create or replace function public.broadcast_questions_freeze_content()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_locked boolean;
begin
  if not exists (
    select 1
    from public.broadcast_question_recipients r
    where r.question_id = old.id
  ) then
    return new;
  end if;

  v_locked :=
    new.prompt is distinct from old.prompt
    or new.question_format is distinct from old.question_format
    or new.selection_mode is distinct from old.selection_mode
    or new.audience_type is distinct from old.audience_type
    or new.is_test is distinct from old.is_test
    or new.idempotency_key is distinct from old.idempotency_key
    or new.admin_actor is distinct from old.admin_actor
    or new.created_at is distinct from old.created_at
    or new.selected_public_ids is distinct from old.selected_public_ids;

  if v_locked then
    raise exception 'question content is fixed once recipients are snapshotted'
      using errcode = '55000';
  end if;

  if current_setting('anynanny.smart_reply_write', true) is distinct from '1'
     and (
       new.smart_replies_enabled is distinct from old.smart_replies_enabled
       or new.smart_reply_mode is distinct from old.smart_reply_mode
       or new.smart_reply_text is distinct from old.smart_reply_text
     )
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
    if tg_op = 'UPDATE'
       and current_setting('anynanny.smart_reply_write', true) = '1'
       and new.id is not distinct from old.id
       and new.question_id is not distinct from old.question_id
       and new.label is not distinct from old.label
       and new.position is not distinct from old.position
    then
      return new;
    end if;

    raise exception 'options are fixed once recipients are snapshotted'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.broadcast_question_assert_smart_replies(
  p_enabled boolean,
  p_mode text,
  p_text text,
  p_replies jsonb,
  p_options text[]
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_enabled boolean := coalesce(p_enabled, false);
  v_mode text := nullif(btrim(coalesce(p_mode, '')), '');
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_replies jsonb := coalesce(p_replies, '{}'::jsonb);
  v_label text;
  v_labels text[] := '{}';
  v_reply text;
begin
  if jsonb_typeof(v_replies) is distinct from 'object' then
    raise exception 'invalid smart reply mapping' using errcode = '22023';
  end if;

  if not v_enabled then
    if v_mode is not null or v_text is not null or v_replies <> '{}'::jsonb then
      raise exception 'smart replies are disabled' using errcode = '22023';
    end if;
    return;
  end if;

  if v_mode not in ('general', 'by_answer') then
    raise exception 'invalid smart reply mode' using errcode = '22023';
  end if;

  if v_mode = 'general' then
    if v_text is null or char_length(v_text) > 2000 or v_text ~ '[<>]' then
      raise exception 'invalid smart reply' using errcode = '22023';
    end if;
    if v_replies <> '{}'::jsonb then
      raise exception 'general smart replies do not use answer mappings' using errcode = '22023';
    end if;
    return;
  end if;

  if v_text is not null then
    raise exception 'answer-based smart replies do not use a general message' using errcode = '22023';
  end if;

  foreach v_label in array coalesce(p_options, '{}'::text[])
  loop
    v_label := nullif(btrim(coalesce(v_label, '')), '');
    if v_label is null then
      raise exception 'smart reply mapping does not match the answers' using errcode = '22023';
    end if;
    v_labels := array_append(v_labels, v_label);
  end loop;

  if cardinality(v_labels) is distinct from (select count(*) from jsonb_object_keys(v_replies)) then
    raise exception 'smart reply mapping does not match the answers' using errcode = '22023';
  end if;

  foreach v_label in array v_labels
  loop
    if not (v_replies ? v_label) then
      raise exception 'smart reply mapping does not match the answers' using errcode = '22023';
    end if;
    v_reply := nullif(btrim(coalesce(v_replies ->> v_label, '')), '');
    if v_reply is null or char_length(v_reply) > 2000 or v_reply ~ '[<>]' then
      raise exception 'invalid smart reply' using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_object_keys(v_replies) as reply_key
    where reply_key <> all (v_labels)
  ) then
    raise exception 'smart reply mapping does not match the answers' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.broadcast_question_apply_smart_replies(
  p_question_id uuid,
  p_enabled boolean,
  p_mode text,
  p_text text,
  p_replies jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := coalesce(p_enabled, false);
  v_mode text := nullif(btrim(coalesce(p_mode, '')), '');
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_replies jsonb := coalesce(p_replies, '{}'::jsonb);
  v_pair record;
  v_reply text;
  v_updated integer;
begin
  if not v_enabled then
    return;
  end if;

  perform set_config('anynanny.smart_reply_write', '1', true);

  if v_mode = 'general' then
    update public.broadcast_questions
       set smart_replies_enabled = true,
           smart_reply_mode = 'general',
           smart_reply_text = v_text
     where id = p_question_id;
    return;
  end if;

  update public.broadcast_questions
     set smart_replies_enabled = true,
         smart_reply_mode = 'by_answer',
         smart_reply_text = null
   where id = p_question_id;

  for v_pair in select key, value from jsonb_each_text(v_replies)
  loop
    v_reply := btrim(v_pair.value);
    update public.broadcast_question_options
       set reply_text = v_reply
     where question_id = p_question_id
       and label = v_pair.key;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'smart reply mapping does not match the answers' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.admin_send_broadcast_question(
  p_audience text,
  p_prompt text,
  p_question_format text,
  p_selection_mode text,
  p_options text[],
  p_idempotency_key text,
  p_is_test boolean,
  p_test_user_id uuid,
  p_smart_replies_enabled boolean,
  p_smart_reply_mode text,
  p_smart_reply_text text,
  p_option_replies jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_question_id uuid;
begin
  perform public.broadcast_question_assert_smart_replies(
    p_smart_replies_enabled,
    p_smart_reply_mode,
    p_smart_reply_text,
    p_option_replies,
    p_options
  );

  v_result := public.admin_send_broadcast_question(
    p_audience,
    p_prompt,
    p_question_format,
    p_selection_mode,
    p_options,
    p_idempotency_key,
    p_is_test,
    p_test_user_id
  );

  if coalesce((v_result ->> 'already_sent')::boolean, false) then
    return v_result;
  end if;

  v_question_id := nullif(v_result ->> 'question_id', '')::uuid;
  if v_question_id is null then
    return v_result;
  end if;

  perform public.broadcast_question_apply_smart_replies(
    v_question_id,
    p_smart_replies_enabled,
    p_smart_reply_mode,
    p_smart_reply_text,
    p_option_replies
  );
  return v_result;
end;
$$;

create or replace function public.admin_send_selected_broadcast_question(
  p_public_ids text[],
  p_prompt text,
  p_question_format text,
  p_selection_mode text,
  p_options text[],
  p_idempotency_key text,
  p_smart_replies_enabled boolean,
  p_smart_reply_mode text,
  p_smart_reply_text text,
  p_option_replies jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_question_id uuid;
begin
  perform public.broadcast_question_assert_smart_replies(
    p_smart_replies_enabled,
    p_smart_reply_mode,
    p_smart_reply_text,
    p_option_replies,
    p_options
  );

  v_result := public.admin_send_selected_broadcast_question(
    p_public_ids,
    p_prompt,
    p_question_format,
    p_selection_mode,
    p_options,
    p_idempotency_key
  );

  if coalesce((v_result ->> 'already_sent')::boolean, false) then
    return v_result;
  end if;

  v_question_id := nullif(v_result ->> 'question_id', '')::uuid;
  if v_question_id is null then
    return v_result;
  end if;

  perform public.broadcast_question_apply_smart_replies(
    v_question_id,
    p_smart_replies_enabled,
    p_smart_reply_mode,
    p_smart_reply_text,
    p_option_replies
  );
  return v_result;
end;
$$;

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
  v_enabled boolean;
  v_reply_mode text;
  v_reply text;
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

  select q.closed_at, q.selection_mode, q.smart_replies_enabled, q.smart_reply_mode, q.smart_reply_text
    into v_closed, v_mode, v_enabled, v_reply_mode, v_reply
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

  if v_first is null and coalesce(v_enabled, false) then
    if v_reply_mode = 'by_answer' then
      select string_agg(o.reply_text, E'\n\n' order by o.position)
        into v_reply
        from public.broadcast_question_options o
       where o.question_id = p_question_id
         and o.id = any (p_option_ids)
         and o.reply_text is not null
         and btrim(o.reply_text) <> '';
    elsif v_reply_mode is distinct from 'general' then
      v_reply := null;
    end if;

    v_reply := nullif(btrim(coalesce(v_reply, '')), '');
    if v_reply is not null then
      insert into public.notifications (
        user_id,
        kind,
        title,
        body,
        payload,
        dedupe_key
      )
      values (
        v_user,
        'admin_broadcast',
        left(v_reply, 80),
        v_reply,
        jsonb_build_object(
          'smart_reply', true,
          'nanny_variant', 'thumbs_up',
          'source_question_id', p_question_id
        ),
        'smart-reply:' || p_question_id::text
      )
      on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
      do nothing;
    end if;
  else
    v_reply := null;
  end if;

  return jsonb_build_object(
    'question_id', p_question_id,
    'option_ids', v_option_ids,
    'replaced', v_first is not null,
    'smart_reply', v_reply
  );
end;
$$;

revoke all on function public.broadcast_question_assert_smart_replies(boolean, text, text, jsonb, text[]) from public;
revoke all on function public.broadcast_question_assert_smart_replies(boolean, text, text, jsonb, text[]) from anon;
revoke all on function public.broadcast_question_assert_smart_replies(boolean, text, text, jsonb, text[]) from authenticated;
revoke all on function public.broadcast_question_assert_smart_replies(boolean, text, text, jsonb, text[]) from service_role;

revoke all on function public.broadcast_question_apply_smart_replies(uuid, boolean, text, text, jsonb) from public;
revoke all on function public.broadcast_question_apply_smart_replies(uuid, boolean, text, text, jsonb) from anon;
revoke all on function public.broadcast_question_apply_smart_replies(uuid, boolean, text, text, jsonb) from authenticated;
revoke all on function public.broadcast_question_apply_smart_replies(uuid, boolean, text, text, jsonb) from service_role;

revoke all on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid, boolean, text, text, jsonb) from public;
revoke all on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid, boolean, text, text, jsonb) from anon;
revoke all on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid, boolean, text, text, jsonb) from authenticated;
grant execute on function public.admin_send_broadcast_question(text, text, text, text, text[], text, boolean, uuid, boolean, text, text, jsonb) to service_role;

revoke all on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text, boolean, text, text, jsonb) from public;
revoke all on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text, boolean, text, text, jsonb) from anon;
revoke all on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text, boolean, text, text, jsonb) from authenticated;
grant execute on function public.admin_send_selected_broadcast_question(text[], text, text, text, text[], text, boolean, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
