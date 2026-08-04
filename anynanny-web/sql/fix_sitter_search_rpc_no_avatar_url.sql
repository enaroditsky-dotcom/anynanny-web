-- Run in Supabase SQL Editor if RPCs fail on sitter_profiles.avatar_url.
-- Copy of: supabase/migrations/20260515140000_fix_sitter_rpc_schema_columns.sql

-- Canonical sitter_profiles columns — NO avatar_url column on this table.
-- Avatars (if any) live on auth.users.raw_user_meta_data->>'avatar_url'.

create or replace function public.get_sitter_profile_public(target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sp record;
  dn text;
  ay integer;
  photo text;
begin
  select * into sp from public.sitter_profiles where id = target_id;
  if not found then return null::jsonb; end if;

  select nullif(trim(u.raw_user_meta_data->>'avatar_url'), '')
    into photo
  from auth.users u
  where u.id = target_id;

  if coalesce(sp.show_full_name, false) then
    dn := nullif(trim(sp.full_name), '');
  else
    dn := nullif(split_part(trim(coalesce(sp.full_name, '')), ' ', 1), '');
  end if;

  if coalesce(sp.show_age, false) and sp.birth_date is not null then
    ay := extract(year from age(sp.birth_date))::integer;
  else
    ay := null;
  end if;

  return jsonb_build_object(
    'id', sp.id,
    'display_name', dn,
    'age_years', ay,
    'languages', sp.languages,
    'years_experience', sp.years_experience,
    'bio', sp.bio,
    'hourly_rate_nis', sp.hourly_rate_nis,
    'citizenship_israeli', sp.citizenship_israeli,
    'birth_country', sp.birth_country,
    'aliyah_year', sp.aliyah_year,
    'preferred_ages', sp.preferred_ages,
    'has_car', sp.has_car,
    'homework_help', sp.homework_help,
    'light_cooking', sp.light_cooking,
    'updated_at', sp.updated_at,
    'is_public', sp.is_public,
    'avg_rating', sp.avg_rating,
    'rating_count', coalesce(sp.rating_count, 0),
    'avatar_url', photo
  );
end;
$$;

create or replace function public.list_public_sitters_search()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sp.id,
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
  where coalesce(sp.is_public, false) = true;
$$;

notify pgrst, 'reload schema';
