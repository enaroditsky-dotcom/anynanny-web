-- Optional proximity/radius filter for parent search and AnyNanny Now.
-- Additive only: existing city + availability + filter logic is unchanged when
-- p_parent_lat / p_parent_lng / p_max_distance_km are NULL.
--
-- Sitter coordinates are a saved service-area reference point, NOT live GPS.
-- Existing sitters with NULL coordinates keep working for city search.
-- They are excluded only when a radius filter is active (distance cannot be known).
--
-- Direct nanny-serial lookup still bypasses city/radius, but availability remains
-- enforced via public.sitter_window_is_available.

-- ---------------------------------------------------------------------------
-- 1. Sitter saved service-area coordinates (private table).
--    Not on sitter_profiles: parents can SELECT public sitter_profiles rows.
-- ---------------------------------------------------------------------------

create table if not exists public.sitter_service_geo (
  sitter_id uuid primary key references public.sitter_profiles(id) on delete cascade,
  service_lat double precision not null,
  service_lng double precision not null,
  updated_at timestamptz not null default now(),
  constraint sitter_service_geo_lat_range check (service_lat >= -90 and service_lat <= 90),
  constraint sitter_service_geo_lng_range check (service_lng >= -180 and service_lng <= 180)
);

comment on table public.sitter_service_geo is
  'Saved sitter service-area reference point. Not live GPS. Sitters only; never expose to parents.';

alter table public.sitter_service_geo enable row level security;

drop policy if exists sitter_service_geo_own on public.sitter_service_geo;
create policy sitter_service_geo_own
  on public.sitter_service_geo
  for all
  to authenticated
  using (sitter_id = auth.uid())
  with check (sitter_id = auth.uid());

grant select, insert, update, delete on public.sitter_service_geo to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Shared geographic engine (Haversine). Used by search AND broadcast.
--    Not granted to clients — only security-definer wrappers call this.
-- ---------------------------------------------------------------------------

create or replace function public.geo_distance_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = public
as $$
  select
    case
      when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
      when p_lat1 < -90 or p_lat1 > 90 or p_lat2 < -90 or p_lat2 > 90 then null
      when p_lng1 < -180 or p_lng1 > 180 or p_lng2 < -180 or p_lng2 > 180 then null
      else 6371.0 * 2 * asin(least(1.0, sqrt(
        power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
        cos(radians(p_lat1)) * cos(radians(p_lat2)) *
        power(sin(radians(p_lng2 - p_lng1) / 2), 2)
      )))
    end
$$;

comment on function public.geo_distance_km(double precision, double precision, double precision, double precision) is
  'Shared straight-line geographic distance in kilometers. Used by search and Broadcast.';

revoke all on function public.geo_distance_km(double precision, double precision, double precision, double precision) from public;
revoke all on function public.geo_distance_km(double precision, double precision, double precision, double precision) from anon;
revoke all on function public.geo_distance_km(double precision, double precision, double precision, double precision) from authenticated;

create or replace function public.sitter_is_within_radius(
  p_sitter_id uuid,
  p_parent_lat double precision,
  p_parent_lng double precision,
  p_max_distance_km double precision
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sitter_service_geo sg
    where sg.sitter_id = p_sitter_id
      and p_parent_lat is not null
      and p_parent_lng is not null
      and p_max_distance_km is not null
      and p_max_distance_km > 0
      and public.geo_distance_km(
        p_parent_lat,
        p_parent_lng,
        sg.service_lat,
        sg.service_lng
      ) <= p_max_distance_km
  );
$$;

comment on function public.sitter_is_within_radius(uuid, double precision, double precision, double precision) is
  'True when the sitter saved service-area point is within p_max_distance_km of the parent. NULL sitter coordinates do not match.';

revoke all on function public.sitter_is_within_radius(uuid, double precision, double precision, double precision) from public;
revoke all on function public.sitter_is_within_radius(uuid, double precision, double precision, double precision) from anon;
revoke all on function public.sitter_is_within_radius(uuid, double precision, double precision, double precision) from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Broadcast geo targeting (parent coordinates are NOT on broadcast_alerts
--    so Realtime INSERT payloads never leak parent GPS to sitters).
-- ---------------------------------------------------------------------------

create table if not exists public.broadcast_alert_geo (
  alert_id uuid primary key references public.broadcast_alerts(id) on delete cascade,
  parent_lat double precision not null,
  parent_lng double precision not null,
  max_distance_km numeric not null,
  created_at timestamptz not null default now(),
  constraint broadcast_alert_geo_lat_range check (parent_lat >= -90 and parent_lat <= 90),
  constraint broadcast_alert_geo_lng_range check (parent_lng >= -180 and parent_lng <= 180),
  constraint broadcast_alert_geo_radius_range check (max_distance_km > 0 and max_distance_km <= 30)
);

comment on table public.broadcast_alert_geo is
  'Optional parent GPS + radius for one Broadcast. Sitters cannot SELECT this table.';

alter table public.broadcast_alert_geo enable row level security;

drop policy if exists broadcast_alert_geo_parent_all on public.broadcast_alert_geo;
create policy broadcast_alert_geo_parent_all
  on public.broadcast_alert_geo
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.broadcast_alerts a
      where a.id = alert_id
        and a.parent_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.broadcast_alerts a
      where a.id = alert_id
        and a.parent_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.broadcast_alert_geo to authenticated;

create or replace function public.sitter_matches_broadcast_radius(
  p_alert_id uuid,
  p_sitter_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  geo_lat double precision;
  geo_lng double precision;
  geo_km numeric;
begin
  if p_alert_id is null or p_sitter_id is null then
    return false;
  end if;

  if auth.uid() is distinct from p_sitter_id then
    return false;
  end if;

  select g.parent_lat, g.parent_lng, g.max_distance_km
    into geo_lat, geo_lng, geo_km
  from public.broadcast_alert_geo g
  where g.alert_id = p_alert_id;

  -- No geo row: existing city-only Broadcast targeting.
  if not found then
    return true;
  end if;

  return public.sitter_is_within_radius(p_sitter_id, geo_lat, geo_lng, geo_km::double precision);
end;
$$;

comment on function public.sitter_matches_broadcast_radius(uuid, uuid) is
  'Broadcast radius gate. True when no geo row exists (city-only) or the sitter is within the stored radius. Callers must still apply city eligibility.';

revoke all on function public.sitter_matches_broadcast_radius(uuid, uuid) from public;
revoke all on function public.sitter_matches_broadcast_radius(uuid, uuid) from anon;
grant execute on function public.sitter_matches_broadcast_radius(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Extend list_public_sitters_search with optional radius params.
--    DROP is required because CREATE OR REPLACE cannot add arguments.
-- ---------------------------------------------------------------------------

drop function if exists public.list_public_sitters_search(text, timestamptz, timestamptz, int, numeric, text, numeric, text, text);

create or replace function public.list_public_sitters_search(
  p_search_nanny_id text default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_min_years_experience int default 0,
  p_min_rating numeric default null,
  p_transport text default 'all',
  p_max_hourly_rate numeric default null,
  p_search_city text default null,
  p_service_type text default null,
  p_parent_lat double precision default null,
  p_parent_lng double precision default null,
  p_max_distance_km double precision default null
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
      end as service_type,
      case
        when p_parent_lat is not null and p_parent_lat >= -90 and p_parent_lat <= 90
          then p_parent_lat
        else null
      end as parent_lat,
      case
        when p_parent_lng is not null and p_parent_lng >= -180 and p_parent_lng <= 180
          then p_parent_lng
        else null
      end as parent_lng,
      case
        when p_max_distance_km is null or p_max_distance_km <= 0 then null
        else least(p_max_distance_km, 30)
      end as max_distance_km
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
        'avatar_url', nullif(trim(u.raw_user_meta_data->>'avatar_url'), ''),
        'distance_km',
          case
            when f.parent_lat is not null
              and f.parent_lng is not null
              and sg.service_lat is not null
              and sg.service_lng is not null
            then round(
              public.geo_distance_km(
                f.parent_lat, f.parent_lng, sg.service_lat, sg.service_lng
              )::numeric,
              1
            )
            else null
          end
      )
      order by rt.avg_rating desc nulls last, rt.rating_count desc, sp.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.sitter_profiles sp
  left join public.sitter_service_geo sg on sg.sitter_id = sp.id
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
    and (
      f.search_serial is not null
      or f.parent_lat is null
      or f.parent_lng is null
      or f.max_distance_km is null
      or public.sitter_is_within_radius(sp.id, f.parent_lat, f.parent_lng, f.max_distance_km)
    )
$$;

grant execute on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text, double precision, double precision, double precision
) to authenticated;

notify pgrst, 'reload schema';
