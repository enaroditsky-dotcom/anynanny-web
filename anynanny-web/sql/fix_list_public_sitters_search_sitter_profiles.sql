-- Run in Supabase SQL Editor if parent search errors mention public.nanny.
-- Same as: supabase/migrations/20260516180000_repair_list_public_sitters_search.sql

-- Repair: ensure list_public_sitters_search uses public.sitter_profiles only (never public.nanny).

do $$
declare
  r record;
begin
  for r in
    select pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'list_public_sitters_search'
  loop
    execute format('drop function if exists public.list_public_sitters_search(%s) cascade', r.args);
  end loop;
end $$;

create or replace function public.list_public_sitters_search(
  p_search_nanny_id text default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_min_years_experience int default 0,
  p_min_rating numeric default null,
  p_transport text default 'all',
  p_max_hourly_rate numeric default 150
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filters as (
    select
      nullif(trim(p_search_nanny_id), '') as search_serial,
      p_start_time as range_start,
      coalesce(p_end_time, p_start_time + interval '4 hours') as range_end,
      greatest(coalesce(p_min_years_experience, 0), 0) as min_years,
      case
        when p_min_rating is null or p_min_rating <= 0 then null
        else p_min_rating
      end as min_rating,
      coalesce(nullif(trim(lower(p_transport)), ''), 'all') as transport_mode,
      greatest(coalesce(p_max_hourly_rate, 150), 0) as max_rate
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sp.id,
        'nanny_serial', nullif(trim(sp.nanny_serial), ''),
        'full_name', nullif(trim(sp.full_name), ''),
        'display_name', coalesce(
          case
            when coalesce(sp.show_full_name, false) then nullif(trim(sp.full_name), '')
            else nullif(split_part(trim(coalesce(sp.full_name, '')), ' ', 1), '')
          end,
          nullif(trim(sp.full_name), ''),
          nullif(trim(p.full_name), '')
        ),
        'email', nullif(trim(u.email), ''),
        'years_experience', sp.years_experience,
        'has_car', coalesce(sp.has_car, false),
        'bio', sp.bio,
        'hourly_rate_nis', sp.hourly_rate_nis,
        'avg_rating', sp.avg_rating,
        'rating_count', coalesce(sp.rating_count, 0),
        'avatar_url', nullif(trim(u.raw_user_meta_data->>'avatar_url'), '')
      )
      order by sp.avg_rating desc nulls last, sp.rating_count desc nulls last, sp.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.sitter_profiles sp
  left join auth.users u on u.id = sp.id
  left join public.profiles p on p.id = sp.id
  cross join filters f
  where coalesce(sp.is_public, false) = true
    and (
      f.search_serial is null
      or sp.nanny_serial ilike '%' || f.search_serial || '%'
    )
    and coalesce(sp.years_experience, 0) >= f.min_years
    and (
      f.min_rating is null
      or coalesce(sp.avg_rating, 0) >= f.min_rating
    )
    and (
      f.transport_mode = 'all'
      or (f.transport_mode = 'self' and coalesce(sp.has_car, false) = true)
      or (f.transport_mode in ('taxi', 'needs_taxi') and coalesce(sp.has_car, false) = false)
    )
    and (
      sp.hourly_rate_nis is null
      or sp.hourly_rate_nis <= f.max_rate
    )
    and (
      f.range_start is null
      or not exists (
        select 1
        from public.sessions s
        where s.sitter_id = sp.id
          and s.status in ('pending_sitter_approval', 'active')
          and s.start_time is not null
          and s.start_time < f.range_end
          and coalesce(s.end_time, s.start_time + interval '4 hours') > f.range_start
      )
    );
$$;

grant execute on function public.list_public_sitters_search(text, timestamptz, timestamptz, int, numeric, text, numeric) to authenticated;

notify pgrst, 'reload schema';
