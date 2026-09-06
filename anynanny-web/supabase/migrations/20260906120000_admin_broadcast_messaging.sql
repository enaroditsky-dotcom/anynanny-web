-- Admin in-app broadcast messaging.
-- Delivers through public.notifications (canonical in-app event log).
-- Does not send Web Push, FCM, SMS, or email.
-- Audience is resolved server-side; clients never supply a recipient list.

-- ---------------------------------------------------------------------------
-- 1. Audit table (final broadcasts only)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_actor text not null default 'admin_dashboard',
  audience_type text not null,
  recipient_count integer not null default 0,
  title text not null,
  body text not null,
  cta_label text,
  cta_route text,
  idempotency_key text not null
);

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
      'profile_complete'
    )
  );

alter table public.admin_broadcasts
  drop constraint if exists admin_broadcasts_recipient_count_check;

alter table public.admin_broadcasts
  add constraint admin_broadcasts_recipient_count_check
  check (recipient_count >= 0);

alter table public.admin_broadcasts
  drop constraint if exists admin_broadcasts_admin_actor_check;

alter table public.admin_broadcasts
  add constraint admin_broadcasts_admin_actor_check
  check (admin_actor = 'admin_dashboard');

create unique index if not exists admin_broadcasts_idempotency_key_uidx
  on public.admin_broadcasts (idempotency_key);

comment on table public.admin_broadcasts is
  'Admin audit log for in-app system broadcasts. No recipient PII. Service-role writers only.';

comment on column public.admin_broadcasts.admin_actor is
  'Dashboard operator identity. Always admin_dashboard; AnyNanny admin is cookie-authenticated, not a Supabase user.';

comment on column public.admin_broadcasts.idempotency_key is
  'Client-generated key that makes a final send retry a no-op.';

alter table public.admin_broadcasts enable row level security;

drop policy if exists admin_broadcasts_select_authenticated on public.admin_broadcasts;
drop policy if exists admin_broadcasts_insert_authenticated on public.admin_broadcasts;
drop policy if exists admin_broadcasts_update_authenticated on public.admin_broadcasts;
drop policy if exists admin_broadcasts_delete_authenticated on public.admin_broadcasts;

revoke all on table public.admin_broadcasts from public;
revoke all on table public.admin_broadcasts from anon;
revoke all on table public.admin_broadcasts from authenticated;

grant select, insert on table public.admin_broadcasts to service_role;

-- ---------------------------------------------------------------------------
-- 2. Audience helper — authoritative product fields only
--    parents: interpretProductProfileOwnership.hasParent
--    sitters: interpretProductProfileOwnership.hasSitter
--    identity: profiles.identity_verification_status = verified
--    profile complete: onboarding for primary profiles.role only
-- ---------------------------------------------------------------------------
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
    else false
  end;
$$;

revoke all on function public.admin_broadcast_recipient_ids(text) from public;
revoke all on function public.admin_broadcast_recipient_ids(text) from anon;
revoke all on function public.admin_broadcast_recipient_ids(text) from authenticated;
grant execute on function public.admin_broadcast_recipient_ids(text) to service_role;

create or replace function public.admin_count_broadcast_recipients(p_audience text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.admin_broadcast_recipient_ids(p_audience);
$$;

revoke all on function public.admin_count_broadcast_recipients(text) from public;
revoke all on function public.admin_count_broadcast_recipients(text) from anon;
revoke all on function public.admin_count_broadcast_recipients(text) from authenticated;
grant execute on function public.admin_count_broadcast_recipients(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Final send: insert notifications from a DB-side audience select
-- ---------------------------------------------------------------------------
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
    'profile_complete'
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

-- Stamp dedupe_key for admin_broadcast if a writer omits it.
create or replace function public.notifications_assign_dedupe_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dedupe_key is not null and btrim(new.dedupe_key) <> '' then
    return new;
  end if;

  new.dedupe_key := case new.kind
    when 'booking_request' then new.payload->>'booking_id'
    when 'booking_approved' then new.payload->>'booking_id'
    when 'booking_rejected' then new.payload->>'booking_id'
    when 'chat_message' then new.payload->>'message_id'
    when 'broadcast_alert' then coalesce(new.payload->>'broadcast_id', new.payload->>'alert_id')
    when 'admin_broadcast' then new.payload->>'broadcast_id'
    when 'booking_cancellation_requested' then new.payload->>'booking_id'
    when 'booking_cancellation_approved' then new.payload->>'booking_id'
    when 'payment_received' then coalesce(new.payload->>'booking_id', new.payload->>'hyp_approval_id')
    when 'payment_required' then coalesce(new.payload->>'session_id', new.payload->>'booking_id')
    when 'pending_no_response_reminder' then new.payload->>'booking_id'
    when 'booking_withdrawn_by_parent' then new.payload->>'booking_id'
    when 'pending_booking_expired' then new.payload->>'booking_id'
    when 'shift_end_reminder' then new.payload->>'booking_id'
    when 'shift_cancelled_no_start' then new.payload->>'booking_id'
    when 'missed_shift_clarification' then new.payload->>'booking_id'
    else new.dedupe_key
  end;

  if new.dedupe_key is not null and btrim(new.dedupe_key) = '' then
    new.dedupe_key := null;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
