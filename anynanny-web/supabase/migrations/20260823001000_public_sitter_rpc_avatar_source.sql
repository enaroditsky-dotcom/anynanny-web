-- Canonical public sitter avatar is public.profiles.avatar_url.
-- Auth metadata avatar remains a fallback only.
-- Does not change F7 privacy (no extra profiles columns, no public sitter_profiles SELECT).
-- Does NOT touch booking lifecycle cron or the expired-pending approval trigger.

-- ---------------------------------------------------------------------------
-- 1. get_sitter_profile_public — same projection; avatar from profiles first.
-- ---------------------------------------------------------------------------
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

comment on function public.get_sitter_profile_public(uuid) is
  'Public sitter profile JSON. avatar_url prefers public.profiles.avatar_url; auth metadata is fallback only.';

revoke all on function public.get_sitter_profile_public(uuid) from public;
revoke all on function public.get_sitter_profile_public(uuid) from anon;
grant execute on function public.get_sitter_profile_public(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. list_public_sitters_search — same F7 projection; avatar from profiles first.
-- ---------------------------------------------------------------------------
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
  'Public sitter discovery. avatar_url prefers public.profiles.avatar_url; auth metadata is fallback only.';

revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) from public;
revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) from anon;
grant execute on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) to authenticated;

notify pgrst, 'reload schema';
