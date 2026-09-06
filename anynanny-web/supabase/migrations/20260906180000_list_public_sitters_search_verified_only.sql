-- Optional parent-search filter: verified identity only.
-- Canonical source: profiles.identity_verification_status = 'verified'
--   (same as isIdentityVerified / parseIdentityVerificationStatus).
-- Does not expose identity documents, ID numbers, KYC provider data, or raw metadata.
-- Does not change RLS or table grants. Forward-only: drops the 9-arg overload
-- so PostgREST has a single list_public_sitters_search signature.

drop function if exists public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
);

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
  p_verified_only boolean default false
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
      coalesce(p_verified_only, false) as verified_only
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
    and (
      not f.verified_only
      or p.identity_verification_status = 'verified'
    )
$$;

comment on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text, boolean
) is
  'Public sitter discovery. Optional p_verified_only AND-filters profiles.identity_verification_status = verified. Does not return KYC/identity metadata.';

revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text, boolean
) from public;
revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text, boolean
) from anon;
grant execute on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';
