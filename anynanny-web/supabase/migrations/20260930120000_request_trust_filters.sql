-- Request trust filters.
--
-- Parent AnyNanny NOW may limit recipients to this parent's favorites
-- and/or identity-verified sitters. A sitter may accept booking requests
-- and NOW alerts only from identity-verified parents.
--
-- Identity source of truth (both roles):
--   profiles.identity_verification_status = 'verified'
-- Favorites source of truth:
--   parent_favorite_sitters (parent_id, sitter_id)
--
-- Existing rows stay open: new booleans default false.
-- Does not change identity verification values.
-- Apply this file in Supabase. It is not applied by the app deploy.

alter table public.broadcast_alerts
  add column if not exists favorites_only boolean not null default false,
  add column if not exists verified_sitters_only boolean not null default false;

comment on column public.broadcast_alerts.favorites_only is
  'When true, NOW notifications go only to this parent''s parent_favorite_sitters. No fallback to all sitters.';

comment on column public.broadcast_alerts.verified_sitters_only is
  'When true, NOW notifications go only to sitters with profiles.identity_verification_status = verified.';

alter table public.sitter_profiles
  add column if not exists only_verified_parents boolean not null default false;

comment on column public.sitter_profiles.only_verified_parents is
  'When true, this sitter receives booking requests and NOW alerts only from parents with profiles.identity_verification_status = verified.';

-- Column SELECT was revoked at table level. New columns need an explicit grant.
-- Row access stays owner-only via sitter_profiles_select_own / update_own.
grant select (only_verified_parents)
  on public.sitter_profiles
  to authenticated;

grant update (only_verified_parents)
  on public.sitter_profiles
  to authenticated;

-- ---------------------------------------------------------------------------
-- Shared predicates. Security definer so triggers can read favorites and
-- the other user's identity status. Not granted to clients.
-- ---------------------------------------------------------------------------
create or replace function public.sitter_accepts_parent_request(
  p_sitter_id uuid,
  p_parent_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_sitter_id is null or p_parent_id is null then true
    when not exists (
      select 1
      from public.sitter_profiles sp
      where sp.id = p_sitter_id
        and coalesce(sp.only_verified_parents, false)
    ) then true
    else exists (
      select 1
      from public.profiles parent
      where parent.id = p_parent_id
        and parent.identity_verification_status = 'verified'
    )
  end;
$$;

comment on function public.sitter_accepts_parent_request(uuid, uuid) is
  'False only when the sitter opted into verified parents and the parent is not profiles.identity_verification_status = verified.';

revoke all on function public.sitter_accepts_parent_request(uuid, uuid) from public;
revoke all on function public.sitter_accepts_parent_request(uuid, uuid) from anon;
revoke all on function public.sitter_accepts_parent_request(uuid, uuid) from authenticated;

create or replace function public.sitter_is_eligible_for_now_broadcast(
  p_sitter_id uuid,
  p_parent_id uuid,
  p_city text,
  p_favorites_only boolean,
  p_verified_sitters_only boolean
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_sitter_id is not null
    and nullif(btrim(coalesce(p_city, '')), '') is not null
    and exists (
      select 1
      from public.sitter_profiles sp
      where sp.id = p_sitter_id
        and coalesce(sp.working_cities, '{}'::text[]) @> array[btrim(p_city)]::text[]
        and (p_parent_id is null or sp.id is distinct from p_parent_id)
        and not public.is_account_suspended(sp.id)
        and (
          p_parent_id is null
          or not public.is_blocked_pair(p_parent_id, sp.id)
        )
        and (
          not coalesce(p_favorites_only, false)
          or (
            p_parent_id is not null
            and exists (
              select 1
              from public.parent_favorite_sitters fav
              where fav.parent_id = p_parent_id
                and fav.sitter_id = sp.id
            )
          )
        )
        and (
          not coalesce(p_verified_sitters_only, false)
          or exists (
            select 1
            from public.profiles sitter_identity
            where sitter_identity.id = sp.id
              and sitter_identity.identity_verification_status = 'verified'
          )
        )
        and (
          not coalesce(sp.only_verified_parents, false)
          or (
            p_parent_id is not null
            and public.sitter_accepts_parent_request(sp.id, p_parent_id)
          )
        )
    );
$$;

comment on function public.sitter_is_eligible_for_now_broadcast(uuid, uuid, text, boolean, boolean) is
  'NOW recipient rule. Favorites and verified-sitter filters are AND. Empty matches stay empty. Also applies only_verified_parents.';

revoke all on function public.sitter_is_eligible_for_now_broadcast(uuid, uuid, text, boolean, boolean) from public;
revoke all on function public.sitter_is_eligible_for_now_broadcast(uuid, uuid, text, boolean, boolean) from anon;
revoke all on function public.sitter_is_eligible_for_now_broadcast(uuid, uuid, text, boolean, boolean) from authenticated;

-- ---------------------------------------------------------------------------
-- NOW notifications. Same insert shape as before; narrower recipient set.
-- ---------------------------------------------------------------------------
create or replace function public.notify_broadcast_alert_recipients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text := nullif(btrim(coalesce(new.city, '')), '');
begin
  if v_city is null then
    return new;
  end if;

  if lower(coalesce(new.status, '')) is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and lower(coalesce(old.status, '')) = 'active' then
    return new;
  end if;

  if new.parent_id is not null and public.is_account_suspended(new.parent_id) then
    return new;
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
    sp.id,
    'broadcast_alert',
    'AnyNanny Now',
    'שידור דחוף באזור השירות שלך',
    jsonb_build_object(
      'broadcast_id', new.id,
      'alert_id', new.id,
      'city', v_city,
      'service_type', new.service_type
    ),
    new.id::text
  from public.sitter_profiles sp
  where public.sitter_is_eligible_for_now_broadcast(
    sp.id,
    new.parent_id,
    v_city,
    coalesce(new.favorites_only, false),
    coalesce(new.verified_sitters_only, false)
  )
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
  do nothing;

  return new;
end;
$$;

revoke all on function public.notify_broadcast_alert_recipients() from public;
revoke all on function public.notify_broadcast_alert_recipients() from anon;
revoke all on function public.notify_broadcast_alert_recipients() from authenticated;

-- Sitter popup / catch-up asks which of these alerts she may actually receive.
create or replace function public.filter_now_broadcasts_for_current_sitter(p_alert_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(a.id), '{}'::uuid[])
  from public.broadcast_alerts a
  where auth.uid() is not null
    and a.id = any(coalesce(p_alert_ids, '{}'::uuid[]))
    and public.sitter_is_eligible_for_now_broadcast(
      auth.uid(),
      a.parent_id,
      a.city,
      coalesce(a.favorites_only, false),
      coalesce(a.verified_sitters_only, false)
    );
$$;

comment on function public.filter_now_broadcasts_for_current_sitter(uuid[]) is
  'Alert ids from the argument list that the current sitter is eligible to receive. Does not reveal other recipients.';

revoke all on function public.filter_now_broadcasts_for_current_sitter(uuid[]) from public;
revoke all on function public.filter_now_broadcasts_for_current_sitter(uuid[]) from anon;
grant execute on function public.filter_now_broadcasts_for_current_sitter(uuid[]) to authenticated;

-- Block a response if she was not an eligible recipient.
create or replace function public.broadcast_responses_enforce_recipient_filters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_city text;
  v_favorites_only boolean;
  v_verified_sitters_only boolean;
begin
  if to_regclass('public.broadcast_alerts') is null then
    return new;
  end if;

  select
    a.parent_id,
    a.city,
    coalesce(a.favorites_only, false),
    coalesce(a.verified_sitters_only, false)
  into v_parent, v_city, v_favorites_only, v_verified_sitters_only
  from public.broadcast_alerts a
  where a.id = new.alert_id;

  if not found then
    return new;
  end if;

  if not public.sitter_is_eligible_for_now_broadcast(
    new.sitter_id,
    v_parent,
    v_city,
    v_favorites_only,
    v_verified_sitters_only
  ) then
    raise exception 'not eligible for this broadcast' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.broadcast_responses_enforce_recipient_filters() from public;
revoke all on function public.broadcast_responses_enforce_recipient_filters() from anon;
revoke all on function public.broadcast_responses_enforce_recipient_filters() from authenticated;

drop trigger if exists broadcast_responses_enforce_recipient_filters on public.broadcast_responses;
create trigger broadcast_responses_enforce_recipient_filters
  before insert on public.broadcast_responses
  for each row
  execute function public.broadcast_responses_enforce_recipient_filters();

-- ---------------------------------------------------------------------------
-- Direct parent → sitter requests. Block the row so no dashboard item and
-- no booking_request notification are created.
-- ---------------------------------------------------------------------------
create or replace function public.parent_may_request_sitter(p_sitter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.sitter_accepts_parent_request(p_sitter_id, auth.uid());
$$;

comment on function public.parent_may_request_sitter(uuid) is
  'Whether the signed-in parent may send a new request to this sitter under only_verified_parents.';

revoke all on function public.parent_may_request_sitter(uuid) from public;
revoke all on function public.parent_may_request_sitter(uuid) from anon;
grant execute on function public.parent_may_request_sitter(uuid) to authenticated;

create or replace function public.bookings_enforce_verified_parent_preference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sitter_accepts_parent_request(new.sitter_id, new.parent_id) then
    raise exception 'הבייביסיטר מקבלת בקשות רק מהורים עם זהות מאומתת'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.bookings_enforce_verified_parent_preference() from public;
revoke all on function public.bookings_enforce_verified_parent_preference() from anon;
revoke all on function public.bookings_enforce_verified_parent_preference() from authenticated;

drop trigger if exists bookings_enforce_verified_parent_preference on public.bookings;
create trigger bookings_enforce_verified_parent_preference
  before insert on public.bookings
  for each row
  execute function public.bookings_enforce_verified_parent_preference();

create or replace function public.notify_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sitter_id is null then
    return new;
  end if;

  if new.parent_id is not null and new.sitter_id = new.parent_id then
    return new;
  end if;

  if lower(coalesce(new.status, '')) is distinct from 'pending' then
    return new;
  end if;

  if not public.sitter_accepts_parent_request(new.sitter_id, new.parent_id) then
    return new;
  end if;

  perform public.create_canonical_notification(
    new.sitter_id,
    'booking_request',
    'בקשת תיאום משמרת',
    'הורה שלח בקשה לתיאום משמרת',
    jsonb_build_object(
      'booking_id', new.id,
      'parent_id', new.parent_id,
      'booking_date', new.booking_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'status', new.status
    ),
    new.id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_booking_insert() from public;
revoke all on function public.notify_booking_insert() from anon;
revoke all on function public.notify_booking_insert() from authenticated;

notify pgrst, 'reload schema';
