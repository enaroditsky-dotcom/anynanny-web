-- Parent search must exclude sitters who are not free for the requested window.
-- Reuses the same conflict definition as lib/bookings/sitter-shift-overlap.ts:
--   bookings: approved | sitter_started | parent_started
--   sessions: confirmed | in_progress | active
-- Overlap (half-open at the boundary):
--   existing.start < requested.end AND existing.end > requested.start
-- Adjacent shifts (e.g. 12:00–15:00 then 15:00–18:00) do NOT conflict.

create or replace function public.sitter_window_is_available(
  p_sitter_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_sitter_id is not null
    and p_start_time is not null
    and p_end_time is not null
    and p_end_time > p_start_time
    and not exists (
      select 1
      from public.bookings b
      where b.sitter_id = p_sitter_id
        and b.status in ('approved', 'sitter_started', 'parent_started')
        and b.start_time is not null
        and b.end_time is not null
        and b.start_time < p_end_time
        and b.end_time > p_start_time
    )
    and not exists (
      select 1
      from public.sessions s
      where s.sitter_id = p_sitter_id
        and lower(coalesce(s.status, '')) in ('confirmed', 'in_progress', 'active')
        and s.start_time is not null
        and s.start_time < p_end_time
        and coalesce(
          s.end_time,
          greatest(now(), s.start_time + interval '1 minute')
        ) > p_start_time
    );
$$;

comment on function public.sitter_window_is_available(uuid, timestamptz, timestamptz) is
  'True when the sitter has no blocking booking/session overlapping [p_start_time, p_end_time). Same statuses as sitter-shift-overlap.ts.';

revoke all on function public.sitter_window_is_available(uuid, timestamptz, timestamptz) from public;
grant execute on function public.sitter_window_is_available(uuid, timestamptz, timestamptz) to authenticated;

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

grant execute on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) to authenticated;

notify pgrst, 'reload schema';
