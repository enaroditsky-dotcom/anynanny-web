-- UGC safety (store-ready minimum): reports, blocks, account suspension,
-- and marketplace enforcement. Does NOT apply Auth bans, delete content,
-- or modify HYP / billing / account-deletion RPCs.
-- Does NOT recreate the obsolete 12-arg list_public_sitters_search overload.
-- Does NOT touch booking lifecycle cron or the expired-pending approval trigger.

-- ---------------------------------------------------------------------------
-- 1. Account-level suspension on public.profiles (covers dual-role users)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists suspended_at timestamptz;

alter table public.profiles
  add column if not exists suspended_reason text;

comment on column public.profiles.suspended_at is
  'Set by operators via service role. NULL means the account is active.';

comment on column public.profiles.suspended_reason is
  'Optional operator note. Not shown on public sitter profiles.';

revoke update (suspended_at, suspended_reason) on table public.profiles from public;
revoke update (suspended_at, suspended_reason) on table public.profiles from anon;
revoke update (suspended_at, suspended_reason) on table public.profiles from authenticated;

create or replace function public.profiles_protect_suspension_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.suspended_at := old.suspended_at;
    new.suspended_reason := old.suspended_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_suspension_columns on public.profiles;
create trigger profiles_protect_suspension_columns
  before update on public.profiles
  for each row
  execute function public.profiles_protect_suspension_columns();

revoke all on function public.profiles_protect_suspension_columns() from public;
revoke all on function public.profiles_protect_suspension_columns() from anon;
revoke all on function public.profiles_protect_suspension_columns() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers (boolean only; no reporter/block row leakage)
-- ---------------------------------------------------------------------------
create or replace function public.is_account_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.suspended_at is not null
  );
$$;

comment on function public.is_account_suspended(uuid) is
  'True when profiles.suspended_at is set. Boolean only; exposes no extra columns.';

revoke all on function public.is_account_suspended(uuid) from public;
revoke all on function public.is_account_suspended(uuid) from anon;
grant execute on function public.is_account_suspended(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. user_reports
-- ---------------------------------------------------------------------------
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null default 'user',
  target_id uuid,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  constraint user_reports_not_self check (reporter_id <> reported_user_id),
  constraint user_reports_target_type_check check (
    target_type in ('user', 'profile', 'message', 'review', 'photo')
  ),
  constraint user_reports_reason_check check (
    reason in ('abuse', 'threats', 'illegal', 'spam_fraud', 'inappropriate', 'other')
  ),
  constraint user_reports_status_check check (status in ('open', 'resolved')),
  constraint user_reports_details_len check (details is null or char_length(details) <= 2000)
);

create index if not exists user_reports_created_at_idx
  on public.user_reports (created_at desc);

create index if not exists user_reports_status_created_idx
  on public.user_reports (status, created_at desc);

create index if not exists user_reports_reported_user_idx
  on public.user_reports (reported_user_id);

create unique index if not exists user_reports_open_dedupe_idx
  on public.user_reports (
    reporter_id,
    reported_user_id,
    target_type,
    coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'open';

alter table public.user_reports enable row level security;

revoke all on table public.user_reports from public;
revoke all on table public.user_reports from anon;
revoke all on table public.user_reports from authenticated;
grant select, insert on table public.user_reports to authenticated;

drop policy if exists user_reports_insert_own on public.user_reports;
create policy user_reports_insert_own
  on public.user_reports
  for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and reporter_id <> reported_user_id
    and target_type in ('user', 'profile', 'message', 'review', 'photo')
    and reason in ('abuse', 'threats', 'illegal', 'spam_fraud', 'inappropriate', 'other')
    and (details is null or char_length(details) <= 2000)
  );

drop policy if exists user_reports_select_own on public.user_reports;
create policy user_reports_select_own
  on public.user_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. user_blocks (directional storage, mutual enforcement via is_blocked_pair)
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id, blocker_id);

alter table public.user_blocks enable row level security;

revoke all on table public.user_blocks from public;
revoke all on table public.user_blocks from anon;
revoke all on table public.user_blocks from authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks
  for insert
  to authenticated
  with check (
    blocker_id = auth.uid()
    and blocker_id <> blocked_id
  );

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

-- Create is_blocked_pair after user_blocks exists (SQL functions are parsed at CREATE).
create or replace function public.is_blocked_pair(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_a is not null
    and p_user_b is not null
    and p_user_a is distinct from p_user_b
    and exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
         or (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
    );
$$;

comment on function public.is_blocked_pair(uuid, uuid) is
  'True when either user has blocked the other. Storage is directional; enforcement is mutual.';

revoke all on function public.is_blocked_pair(uuid, uuid) from public;
revoke all on function public.is_blocked_pair(uuid, uuid) from anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Public sitter eligibility, search, and profile
-- ---------------------------------------------------------------------------
create or replace function public.is_public_sitter(p_sitter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sitter_profiles sp
    where sp.id = p_sitter_id
      and coalesce(sp.is_public, false) = true
      and not public.is_account_suspended(p_sitter_id)
  );
$$;

comment on function public.is_public_sitter(uuid) is
  'Public/eligible sitter check for booking insert. Excludes suspended accounts. Exposes no sitter columns.';

revoke all on function public.is_public_sitter(uuid) from public;
revoke all on function public.is_public_sitter(uuid) from anon;
grant execute on function public.is_public_sitter(uuid) to authenticated;

create or replace function public.get_sitter_profile_public(target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  spj jsonb;
  rt_avg numeric(4, 2);
  rt_count int;
  photo text;
  dn text;
  ln text;
  first_n text;
  last_n text;
  combined text;
  ay integer;
  show_full boolean;
  show_age_flag boolean;
  birth date;
begin
  if public.is_account_suspended(target_id) then
    return null::jsonb;
  end if;

  if auth.uid() is not null and public.is_blocked_pair(auth.uid(), target_id) then
    return null::jsonb;
  end if;

  select to_jsonb(sp)
    into spj
  from public.sitter_profiles sp
  where sp.id = target_id
    and coalesce(sp.is_public, false) = true
    and sp.onboarding_completed_at is not null;

  if spj is null then
    return null::jsonb;
  end if;

  select coalesce(
    (select nullif(trim(pr.avatar_url), '') from public.profiles pr where pr.id = target_id),
    (select nullif(trim(u.raw_user_meta_data->>'avatar_url'), '') from auth.users u where u.id = target_id)
  )
    into photo;

  select
    avg(r.rating)::numeric(4, 2),
    count(*)::int
    into rt_avg, rt_count
  from public.ratings r
  where r.to_user_id = target_id
    and r.published_at is not null;

  first_n := nullif(trim(spj->>'first_name'), '');
  last_n := nullif(trim(spj->>'last_name'), '');
  combined := nullif(trim(concat_ws(' ', first_n, last_n)), '');

  show_full := coalesce((spj->>'show_full_name')::boolean, false);
  if show_full then
    dn := combined;
    ln := last_n;
  else
    dn := first_n;
    ln := null;
  end if;

  show_age_flag := coalesce((spj->>'show_age')::boolean, false);
  begin
    birth := nullif(spj->>'birth_date', '')::date;
  exception when others then
    birth := null;
  end;

  if show_age_flag and birth is not null then
    ay := extract(year from age(birth))::integer;
  else
    ay := null;
  end if;

  return jsonb_build_object(
    'id', (spj->>'id')::uuid,
    'first_name', first_n,
    'last_name', ln,
    'nanny_serial', nullif(trim(coalesce(spj->>'nanny_serial', spj->>'nanny_id_number')), ''),
    'display_name', dn,
    'age_years', ay,
    'languages', spj->'languages',
    'years_experience', nullif(spj->>'years_experience', '')::numeric,
    'bio', spj->>'bio',
    'hourly_rate_nis', nullif(spj->>'hourly_rate_nis', '')::numeric,
    'pricing_model', coalesce(nullif(trim(spj->>'pricing_model'), ''), 'hourly'),
    'package_price_nis', nullif(spj->>'package_price_nis', '')::numeric,
    'service_types', coalesce(
      case
        when jsonb_typeof(spj->'service_types') = 'array' then (
          select array_agg(x)
          from jsonb_array_elements_text(spj->'service_types') as t(x)
        )
        else null
      end,
      array['babysitter']::text[]
    ),
    'certifications', nullif(trim(spj->>'certifications'), ''),
    'citizenship_israeli', nullif(spj->>'citizenship_israeli', '')::boolean,
    'birth_country', nullif(trim(spj->>'birth_country'), ''),
    'aliyah_year', nullif(spj->>'aliyah_year', '')::numeric,
    'preferred_ages', spj->'preferred_ages',
    'has_car', coalesce((spj->>'has_car')::boolean, false),
    'working_cities', coalesce(
      case
        when jsonb_typeof(spj->'working_cities') = 'array' then (
          select coalesce(array_agg(x), '{}'::text[])
          from jsonb_array_elements_text(spj->'working_cities') as t(x)
        )
        else '{}'::text[]
      end,
      '{}'::text[]
    ),
    'homework_help', coalesce((spj->>'homework_help')::boolean, false),
    'light_cooking', coalesce((spj->>'light_cooking')::boolean, false),
    'updated_at', spj->>'updated_at',
    'is_public', coalesce((spj->>'is_public')::boolean, false),
    'avg_rating', coalesce(rt_avg, nullif(spj->>'avg_rating', '')::numeric),
    'rating_count', coalesce(rt_count, coalesce(nullif(spj->>'rating_count', '')::int, 0)),
    'avatar_url', photo
  );
end;
$$;

comment on function public.get_sitter_profile_public(uuid) is
  'Public sitter profile JSON. Hides suspended and mutually blocked sitters. last_name/display_name respect show_full_name.';

revoke all on function public.get_sitter_profile_public(uuid) from public;
revoke all on function public.get_sitter_profile_public(uuid) from anon;
grant execute on function public.get_sitter_profile_public(uuid) to authenticated;

create or replace function public.list_public_sitters_search(
  p_search_nanny_id text default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_min_years_experience int default 0,
  p_min_rating numeric default null,
  p_transport text default 'all',
  p_max_hourly_rate numeric default null,
  p_search_city text default null,
  p_service_type text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filters as (
    select
      nullif(trim(p_search_nanny_id), '') as search_serial_raw,
      case
        when nullif(trim(p_search_nanny_id), '') is null then null::text
        when upper(regexp_replace(trim(p_search_nanny_id), '\s+', '', 'g')) ~ '^\d+$'
          then 'AN-' || upper(regexp_replace(trim(p_search_nanny_id), '\s+', '', 'g'))
        else upper(regexp_replace(trim(p_search_nanny_id), '\s+', '', 'g'))
      end as search_serial,
      p_start_time as range_start,
      coalesce(p_end_time, p_start_time + interval '4 hours') as range_end,
      greatest(coalesce(p_min_years_experience, 0), 0) as min_years,
      case
        when p_min_rating is null or p_min_rating <= 0 then null
        else p_min_rating
      end as min_rating,
      coalesce(nullif(trim(lower(p_transport)), ''), 'all') as transport_mode,
      case
        when p_max_hourly_rate is null or p_max_hourly_rate < 0 then null
        else greatest(p_max_hourly_rate, 0)
      end as max_rate,
      nullif(trim(p_search_city), '') as search_city,
      case lower(coalesce(nullif(trim(p_service_type), ''), 'babysitter'))
        when 'sitter' then 'babysitter'
        when 'babysitter' then 'babysitter'
        when 'sleep' then 'sleep_consultant'
        when 'sleep_consultant' then 'sleep_consultant'
        when 'lactation' then 'lactation_consultant'
        when 'lactation_consultant' then 'lactation_consultant'
        when 'doula' then 'doula'
        else 'babysitter'
      end as service_type
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sp.id,
        'nanny_serial', nullif(trim(sp.nanny_serial), ''),
        'first_name', nullif(trim(sp.first_name), ''),
        'last_name', case
          when coalesce(sp.show_full_name, false) then nullif(trim(sp.last_name), '')
          else null
        end,
        'display_name', case
          when coalesce(sp.show_full_name, false) then nullif(trim(concat_ws(
            ' ',
            nullif(trim(sp.first_name), ''),
            nullif(trim(sp.last_name), '')
          )), '')
          else nullif(trim(sp.first_name), '')
        end,
        'years_experience', sp.years_experience,
        'has_car', coalesce(sp.has_car, false),
        'working_cities', coalesce(sp.working_cities, '{}'::text[]),
        'bio', sp.bio,
        'hourly_rate_nis', sp.hourly_rate_nis,
        'pricing_model', coalesce(nullif(trim(sp.pricing_model), ''), 'hourly'),
        'package_price_nis', sp.package_price_nis,
        'service_types', coalesce(sp.service_types, array['babysitter']::text[]),
        'languages', sp.languages,
        'certifications', nullif(trim(sp.certifications), ''),
        'avg_rating', rt.avg_rating,
        'rating_count', coalesce(rt.rating_count, 0),
        'avatar_url', coalesce(
          nullif(trim(p.avatar_url), ''),
          nullif(trim(u.raw_user_meta_data->>'avatar_url'), '')
        )
      )
      order by rt.avg_rating desc nulls last, rt.rating_count desc, sp.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.sitter_profiles sp
  left join auth.users u on u.id = sp.id
  left join public.profiles p on p.id = sp.id
  left join lateral (
    select
      avg(r.rating)::numeric(4, 2) as avg_rating,
      count(*)::int as rating_count
    from public.ratings r
    where r.to_user_id = sp.id
      and r.published_at is not null
  ) rt on true
  cross join filters f
  where coalesce(sp.is_public, false) = true
    and sp.onboarding_completed_at is not null
    and coalesce(sp.is_paused, false) = false
    and p.suspended_at is null
    and (
      auth.uid() is null
      or not public.is_blocked_pair(auth.uid(), sp.id)
    )
    and (
      f.search_serial is null
      or upper(regexp_replace(trim(coalesce(sp.nanny_serial, '')), '\s+', '', 'g')) = f.search_serial
      or upper(regexp_replace(trim(coalesce(sp.nanny_id_number, '')), '\s+', '', 'g')) = f.search_serial
    )
    and (
      f.search_serial is not null
      or coalesce(sp.years_experience, 0) >= f.min_years
    )
    and (
      f.search_serial is not null
      or f.min_rating is null
      or coalesce(rt.avg_rating, 0) >= f.min_rating
    )
    and (
      f.search_serial is not null
      or f.transport_mode = 'all'
      or (f.transport_mode in ('self', 'car', 'עצמאית') and coalesce(sp.has_car, false) = true)
      or (f.transport_mode in ('taxi', 'needs_taxi', 'מונית') and coalesce(sp.has_car, false) = false)
    )
    and (
      f.search_serial is not null
      or f.max_rate is null
      or (
        coalesce(nullif(trim(sp.pricing_model), ''), 'hourly') = 'package'
        and (sp.package_price_nis is null or sp.package_price_nis <= f.max_rate)
      )
      or (
        coalesce(nullif(trim(sp.pricing_model), ''), 'hourly') <> 'package'
        and (sp.hourly_rate_nis is null or sp.hourly_rate_nis <= f.max_rate)
      )
    )
    and (
      f.search_serial is not null
      or f.search_city is null
      or coalesce(sp.working_cities, '{}'::text[]) @> array[f.search_city]::text[]
    )
    and (
      f.search_serial is not null
      or coalesce(sp.service_types, array['babysitter']::text[]) @> array[f.service_type]::text[]
    )
    and (
      f.range_start is null
      or f.range_end is null
      or public.sitter_window_is_available(sp.id, f.range_start, f.range_end)
    )
$$;

comment on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) is
  'Public sitter discovery. Excludes suspended sitters and mutually blocked pairs.';

revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) from public;
revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) from anon;
grant execute on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Booking create / sitter approve
-- ---------------------------------------------------------------------------
drop policy if exists bookings_insert_parent on public.bookings;
create policy bookings_insert_parent on public.bookings
  for insert to authenticated
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'parent'
    )
    and public.is_public_sitter(sitter_id)
    and not public.is_account_suspended(auth.uid())
    and not public.is_account_suspended(sitter_id)
    and not public.is_blocked_pair(parent_id, sitter_id)
  );

drop policy if exists bookings_update_sitter on public.bookings;
create policy bookings_update_sitter on public.bookings
  for update to authenticated
  using (sitter_id = auth.uid())
  with check (
    sitter_id = auth.uid()
    and (
      lower(btrim(coalesce(status, ''))) is distinct from 'approved'
      or (
        not public.is_account_suspended(auth.uid())
        and not public.is_account_suspended(parent_id)
        and not public.is_blocked_pair(parent_id, sitter_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Chat message send (history SELECT unchanged)
-- ---------------------------------------------------------------------------
drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and not public.is_account_suspended(auth.uid())
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (b.parent_id = auth.uid() or b.sitter_id = auth.uid())
        and not public.is_blocked_pair(b.parent_id, b.sitter_id)
        and not public.is_account_suspended(b.parent_id)
        and not public.is_account_suspended(b.sitter_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Broadcast matching + create/respond (tables may exist only remotely)
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
  where coalesce(sp.working_cities, '{}'::text[]) @> array[v_city]::text[]
    and (new.parent_id is null or sp.id is distinct from new.parent_id)
    and not public.is_account_suspended(sp.id)
    and (
      new.parent_id is null
      or not public.is_blocked_pair(new.parent_id, sp.id)
    )
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
  do nothing;

  return new;
end;
$$;

revoke all on function public.notify_broadcast_alert_recipients() from public;
revoke all on function public.notify_broadcast_alert_recipients() from anon;
revoke all on function public.notify_broadcast_alert_recipients() from authenticated;

create or replace function public.broadcast_alerts_enforce_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is not null and public.is_account_suspended(new.parent_id) then
    raise exception 'account is suspended' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.broadcast_responses_enforce_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
begin
  if new.sitter_id is not null and public.is_account_suspended(new.sitter_id) then
    raise exception 'account is suspended' using errcode = '42501';
  end if;

  if to_regclass('public.broadcast_alerts') is null then
    return new;
  end if;

  select a.parent_id
    into v_parent
  from public.broadcast_alerts a
  where a.id = new.alert_id;

  if v_parent is not null and public.is_account_suspended(v_parent) then
    raise exception 'account is suspended' using errcode = '42501';
  end if;

  if v_parent is not null
     and new.sitter_id is not null
     and public.is_blocked_pair(v_parent, new.sitter_id) then
    raise exception 'users are blocked' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.broadcast_alerts_enforce_safety() from public;
revoke all on function public.broadcast_alerts_enforce_safety() from anon;
revoke all on function public.broadcast_alerts_enforce_safety() from authenticated;

revoke all on function public.broadcast_responses_enforce_safety() from public;
revoke all on function public.broadcast_responses_enforce_safety() from anon;
revoke all on function public.broadcast_responses_enforce_safety() from authenticated;

do $$
begin
  if to_regclass('public.broadcast_alerts') is not null then
    drop trigger if exists broadcast_alerts_enforce_safety on public.broadcast_alerts;
    create trigger broadcast_alerts_enforce_safety
      before insert on public.broadcast_alerts
      for each row
      execute function public.broadcast_alerts_enforce_safety();
  end if;

  if to_regclass('public.broadcast_responses') is not null then
    drop trigger if exists broadcast_responses_enforce_safety on public.broadcast_responses;
    create trigger broadcast_responses_enforce_safety
      before insert on public.broadcast_responses
      for each row
      execute function public.broadcast_responses_enforce_safety();
  end if;
end;
$$;

notify pgrst, 'reload schema';
