-- Optional marketing consent on the existing profiles row.
-- Existing rows stay opted out: boolean default false, and prompted_at stays NULL
-- so those users can be asked once. No backfill to true. No new RAN/RP tables.
-- Operational messaging does not read these columns.

alter table public.profiles
  add column if not exists marketing_consent boolean not null default false;

alter table public.profiles
  add column if not exists marketing_consent_at timestamptz;

alter table public.profiles
  add column if not exists marketing_consent_version text;

alter table public.profiles
  add column if not exists marketing_consent_source text;

alter table public.profiles
  add column if not exists marketing_consent_prompted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_marketing_consent_source_check;

alter table public.profiles
  add constraint profiles_marketing_consent_source_check
  check (
    marketing_consent_source is null
    or marketing_consent_source in ('registration', 'post_login_prompt', 'settings')
  );

comment on column public.profiles.marketing_consent is
  'Separate opt-in for direct marketing (SMS, email, digital). False is not consent. Does not gate operational messages.';

comment on column public.profiles.marketing_consent_at is
  'When the user last granted marketing consent. NULL when there is no current grant.';

comment on column public.profiles.marketing_consent_version is
  'Marketing consent copy version granted, e.g. 1.0. NULL when there is no current grant.';

comment on column public.profiles.marketing_consent_source is
  'Where the current grant was recorded: registration, post_login_prompt, or settings. NULL when not granted.';

comment on column public.profiles.marketing_consent_prompted_at is
  'When the user was asked. NULL means never asked. Set on accept or decline so the prompt is not repeated.';

-- Future admin broadcast audiences. Existing operational audiences are unchanged
-- and do not consult marketing_consent. These two filters read profiles only:
-- RP-#### parents and RAN-#### sitters who currently opted in.

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
      'ran_marketing_opt_in'
    )
  );

create or replace function public.admin_broadcast_recipient_ids(p_audience text)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where case p_audience
    when 'all_users' then true
    when 'parents' then
      p.role = 'parent' or p.parent_onboarding_completed_at is not null
    when 'sitters' then
      p.role = 'sitter'
      or exists (
        select 1
        from public.sitter_profiles sp
        where sp.id = p.id
          and sp.onboarding_completed_at is not null
      )
    when 'identity_verified' then
      p.identity_verification_status = 'verified'
    when 'identity_unverified' then
      coalesce(p.identity_verification_status, 'unverified') is distinct from 'verified'
    when 'profile_complete' then
      (
        p.role = 'parent'
        and p.parent_onboarding_completed_at is not null
      )
      or (
        p.role = 'sitter'
        and exists (
          select 1
          from public.sitter_profiles sp
          where sp.id = p.id
            and sp.onboarding_completed_at is not null
        )
      )
    when 'profile_incomplete' then
      not (
        (
          p.role = 'parent'
          and p.parent_onboarding_completed_at is not null
        )
        or (
          p.role = 'sitter'
          and exists (
            select 1
            from public.sitter_profiles sp
            where sp.id = p.id
              and sp.onboarding_completed_at is not null
          )
        )
      )
    when 'rp_marketing_opt_in' then
      p.marketing_consent is true
      and public.normalize_parent_public_id(p.parent_serial) like 'RP-%'
    when 'ran_marketing_opt_in' then
      p.marketing_consent is true
      and public.normalize_sitter_public_id(p.nanny_serial) like 'RAN-%'
    else false
  end;
$$;

revoke all on function public.admin_broadcast_recipient_ids(text) from public;
revoke all on function public.admin_broadcast_recipient_ids(text) from anon;
revoke all on function public.admin_broadcast_recipient_ids(text) from authenticated;
grant execute on function public.admin_broadcast_recipient_ids(text) to service_role;

create or replace function public.admin_send_in_app_broadcast(
  p_audience text,
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
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing public.admin_broadcasts%rowtype;
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
    raise exception 'invalid audience';
  end if;

  if v_title is null or v_body is null then
    raise exception 'title and body are required';
  end if;

  if char_length(v_title) > 80 or char_length(v_body) > 2000 then
    raise exception 'title or body too long';
  end if;

  if v_title ~ '[<>]' or v_body ~ '[<>]' then
    raise exception 'plain text only';
  end if;

  if v_key is null then
    raise exception 'idempotency key is required';
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

  insert into public.admin_broadcasts (
    admin_actor,
    audience_type,
    recipient_count,
    title,
    body,
    cta_label,
    cta_route,
    idempotency_key
  )
  values (
    'admin_dashboard',
    p_audience,
    0,
    v_title,
    v_body,
    nullif(btrim(coalesce(p_cta_label, '')), ''),
    nullif(btrim(coalesce(p_cta_route, '')), ''),
    v_key
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
    r.user_id,
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
  from public.admin_broadcast_recipient_ids(p_audience) r
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
  do nothing;

  get diagnostics v_count = row_count;

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

revoke all on function public.admin_send_in_app_broadcast(text, text, text, text, text, text) from public;
revoke all on function public.admin_send_in_app_broadcast(text, text, text, text, text, text) from anon;
revoke all on function public.admin_send_in_app_broadcast(text, text, text, text, text, text) from authenticated;
grant execute on function public.admin_send_in_app_broadcast(text, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
