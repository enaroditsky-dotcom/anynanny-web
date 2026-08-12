-- Ratings publication gate: Parent→Sitter stays unpublished until payment succeeds.
-- Sitter→Parent publishes immediately after a paid session.
-- Public aggregates / reviews count ONLY published_at IS NOT NULL.

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
alter table public.ratings
  add column if not exists published_at timestamptz null;

comment on column public.ratings.published_at is
  'Null = pending/private (Parent→Sitter before payment). Non-null = public reputation.';

create index if not exists ratings_published_to_user_idx
  on public.ratings (to_user_id, published_at)
  where published_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Backfill: historical ratings for already-paid sessions stay public
-- ---------------------------------------------------------------------------
update public.ratings r
set published_at = coalesce(r.created_at, now())
from public.sessions s
where r.session_id = s.id
  and r.published_at is null
  and (
    s.status::text = 'paid'
    or s.status::text = 'completed'
    or exists (
      select 1
      from public.bookings b
      where b.id = coalesce(s.booking_id, s.id)
        and (
          b.payment_status::text = 'paid'
          or b.paid_at is not null
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Aggregate refresh (published only)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_sitter_avg_rating_for_user(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric;
  v_cnt integer;
begin
  if target_user is null then
    return;
  end if;

  select round(avg(r.rating)::numeric, 2), count(*)::integer
    into v_avg, v_cnt
  from public.ratings r
  where r.to_user_id = target_user
    and r.published_at is not null;

  update public.sitter_profiles sp
  set
    avg_rating = v_avg,
    rating_count = coalesce(v_cnt, 0),
    updated_at = now()
  where sp.id = target_user;
end;
$$;

create or replace function public.trg_ratings_refresh_sitter_avg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.published_at is not null then
      perform public.refresh_sitter_avg_rating_for_user(new.to_user_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.published_at is not null
       and (
         old.published_at is null
         or old.rating is distinct from new.rating
         or old.to_user_id is distinct from new.to_user_id
       )
    then
      perform public.refresh_sitter_avg_rating_for_user(new.to_user_id);
      if old.to_user_id is distinct from new.to_user_id then
        perform public.refresh_sitter_avg_rating_for_user(old.to_user_id);
      end if;
    elsif old.published_at is not null and new.published_at is null then
      perform public.refresh_sitter_avg_rating_for_user(coalesce(new.to_user_id, old.to_user_id));
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists ratings_after_insert_refresh_sitter_avg on public.ratings;
create trigger ratings_after_insert_refresh_sitter_avg
  after insert on public.ratings
  for each row
  execute procedure public.trg_ratings_refresh_sitter_avg();

drop trigger if exists ratings_after_update_refresh_sitter_avg on public.ratings;
create trigger ratings_after_update_refresh_sitter_avg
  after update of published_at, rating, to_user_id on public.ratings
  for each row
  execute procedure public.trg_ratings_refresh_sitter_avg();

-- Recompute denormalized sitter aggregates from published ratings only.
do $$
declare
  r record;
begin
  for r in
    select distinct to_user_id as uid
    from public.ratings
    where to_user_id is not null
  loop
    perform public.refresh_sitter_avg_rating_for_user(r.uid);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Idempotent publish helper (best-effort from payment finalizer)
-- ---------------------------------------------------------------------------
create or replace function public.publish_parent_ratings_for_paid_sessions(p_session_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_sitter uuid;
begin
  if p_session_ids is null or array_length(p_session_ids, 1) is null then
    return 0;
  end if;

  -- Authenticated callers may only publish for their own parent sessions.
  -- Service-role calls typically have auth.uid() null and may publish any paid session.
  with target as (
    select s.id, s.parent_id, s.sitter_id
    from public.sessions s
    where s.id = any (p_session_ids)
      and s.status::text = 'paid'
      and (auth.uid() is null or s.parent_id = auth.uid())
  ),
  published as (
    update public.ratings r
       set published_at = now()
      from target t
     where r.session_id = t.id
       and r.from_user_id = t.parent_id
       and r.published_at is null
    returning r.to_user_id
  )
  select count(*)::integer into v_updated from published;

  for v_sitter in
    select distinct r.to_user_id
    from public.ratings r
    where r.session_id = any (p_session_ids)
      and r.published_at is not null
      and r.to_user_id is not null
  loop
    perform public.refresh_sitter_avg_rating_for_user(v_sitter);
  end loop;

  return coalesce(v_updated, 0);
end;
$$;

revoke all on function public.publish_parent_ratings_for_paid_sessions(uuid[]) from public;
grant execute on function public.publish_parent_ratings_for_paid_sessions(uuid[]) to authenticated;
grant execute on function public.publish_parent_ratings_for_paid_sessions(uuid[]) to service_role;

comment on function public.publish_parent_ratings_for_paid_sessions(uuid[]) is
  'Idempotent: sets published_at on Parent→Sitter ratings for paid sessions. Safe under HYP retries.';

-- ---------------------------------------------------------------------------
-- 5. Enforce published_at on INSERT (clients cannot self-publish as parent)
-- ---------------------------------------------------------------------------
create or replace function public.trg_ratings_enforce_published_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_sitter uuid;
  v_status text;
begin
  select s.parent_id, s.sitter_id, s.status::text
    into v_parent, v_sitter, v_status
  from public.sessions s
  where s.id = new.session_id;

  if v_parent is null and v_sitter is null then
    raise exception 'rating session not found' using errcode = 'foreign_key_violation';
  end if;

  if new.from_user_id = v_parent and new.to_user_id = v_sitter then
    -- Parent → Sitter: always unpublished until payment publish helper runs.
    new.published_at := null;
  elsif new.from_user_id = v_sitter and new.to_user_id = v_parent then
    if v_status is distinct from 'paid' then
      raise exception 'sitter may rate only after payment' using errcode = 'check_violation';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists ratings_before_insert_enforce_published_at on public.ratings;
create trigger ratings_before_insert_enforce_published_at
  before insert on public.ratings
  for each row
  execute procedure public.trg_ratings_enforce_published_at();

-- ---------------------------------------------------------------------------
-- 6. RLS — insert direction rules + published select for reputation
-- ---------------------------------------------------------------------------
alter table if exists public.ratings enable row level security;

drop policy if exists "ratings_insert_session_participant" on public.ratings;
drop policy if exists "ratings_select_published" on public.ratings;
drop policy if exists "ratings_select_participant" on public.ratings;

-- Authors may always read their own rows (including unpublished Parent drafts).
-- All authenticated users may read published reputation rows only.
create policy "ratings_select_participant"
  on public.ratings
  for select
  to authenticated
  using (
    from_user_id = auth.uid()
    or published_at is not null
  );

create policy "ratings_insert_session_participant"
  on public.ratings
  for insert
  to authenticated
  with check (
    from_user_id = auth.uid()
    and from_user_id is distinct from to_user_id
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and (
          -- Parent → Sitter: allowed before/during/after payment settlement
          (
            s.parent_id = auth.uid()
            and s.sitter_id is not null
            and to_user_id = s.sitter_id
            and s.status::text in ('completed', 'payment_pending', 'paid', 'sitter_completed')
          )
          or
          -- Sitter → Parent: only after successful payment
          (
            s.sitter_id = auth.uid()
            and s.parent_id is not null
            and to_user_id = s.parent_id
            and s.status::text = 'paid'
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Public RPCs — published ratings only
-- ---------------------------------------------------------------------------
create or replace function public.get_sitter_public_reviews(p_sitter_id uuid, p_limit int default 3)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rating', r.rating,
        'comment', r.comment,
        'created_at', r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select x.rating, x.comment, x.created_at
    from public.ratings x
    where x.to_user_id = p_sitter_id
      and x.published_at is not null
      and x.comment is not null
      and length(trim(x.comment)) > 0
    order by x.created_at desc
    limit greatest(1, least(coalesce(p_limit, 3), 20))
  ) r;
$$;

grant execute on function public.get_sitter_public_reviews(uuid, int) to authenticated;

create or replace function public.get_current_user_rating()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_avg numeric;
  v_cnt integer;
  v_nanny_id text;
begin
  if uid is null then
    return json_build_object(
      'avg_rating', null,
      'rating_count', 0,
      'nanny_id_number', null
    );
  end if;

  select round(avg(r.rating)::numeric, 2), count(*)::integer
    into v_avg, v_cnt
  from public.ratings r
  where r.to_user_id = uid
    and r.published_at is not null;

  select coalesce(
      nullif(trim(sp.nanny_id_number), ''),
      nullif(trim(sp.nanny_serial), '')
    )
    into v_nanny_id
  from public.sitter_profiles sp
  where sp.id = uid;

  return json_build_object(
    'avg_rating', v_avg,
    'rating_count', coalesce(v_cnt, 0),
    'nanny_id_number', v_nanny_id
  );
end;
$$;

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
  combined text;
  ay integer;
  show_full boolean;
  show_age_flag boolean;
  birth date;
begin
  select to_jsonb(sp)
    into spj
  from public.sitter_profiles sp
  where sp.id = target_id;

  if spj is null then
    return null::jsonb;
  end if;

  select nullif(trim(u.raw_user_meta_data->>'avatar_url'), '')
    into photo
  from auth.users u
  where u.id = target_id;

  select
    avg(r.rating)::numeric(4, 2),
    count(*)::int
    into rt_avg, rt_count
  from public.ratings r
  where r.to_user_id = target_id
    and r.published_at is not null;

  combined := nullif(trim(concat_ws(
    ' ',
    nullif(trim(spj->>'first_name'), ''),
    nullif(trim(spj->>'last_name'), '')
  )), '');

  show_full := coalesce((spj->>'show_full_name')::boolean, false);
  if show_full then
    dn := combined;
  else
    dn := nullif(trim(spj->>'first_name'), '');
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
    'first_name', nullif(trim(spj->>'first_name'), ''),
    'last_name', nullif(trim(spj->>'last_name'), ''),
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
        'last_name', nullif(trim(sp.last_name), ''),
        'display_name', coalesce(
          nullif(trim(sp.first_name), ''),
          nullif(trim(concat_ws(' ', sp.first_name, sp.last_name)), ''),
          nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
        ),
        'email', nullif(trim(u.email), ''),
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
        'avatar_url', nullif(trim(u.raw_user_meta_data->>'avatar_url'), '')
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
    and coalesce(sp.is_paused, false) = false
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
$$;

grant execute on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) to authenticated;

notify pgrst, 'reload schema';
