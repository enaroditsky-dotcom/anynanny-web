-- Fix RPCs that reference non-existent sitter_profiles columns (e.g. avatar_url).
-- Canonical sitter_profiles columns (see sql/create_sitter_profiles.sql + alters):
--   id, full_name, show_full_name, id_number, birth_date, show_age, citizenship_israeli,
--   birth_country, aliyah_year, address_full, military_service, referee_phone_1/2,
--   years_experience, preferred_ages, has_car, languages, homework_help, light_cooking,
--   bio, hourly_rate_nis, legal_no_criminal_declaration, is_public, onboarding_completed_at,
--   updated_at, nanny_serial (optional), avg_rating, rating_count (optional, from create_ratings.sql)
-- Profile photos are NOT stored on sitter_profiles; use auth.users raw_user_meta_data if needed.

-- ---------------------------------------------------------------------------
-- Public profile JSON (no avatar_url on sitter_profiles).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Last N text reviews toward a sitter.
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
      and x.comment is not null
      and length(trim(x.comment)) > 0
    order by x.created_at desc
    limit greatest(1, least(coalesce(p_limit, 3), 20))
  ) r;
$$;

-- ---------------------------------------------------------------------------
-- Search cards: only sitter_profiles columns + OAuth avatar from auth.users.
-- ---------------------------------------------------------------------------
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

grant execute on function public.get_sitter_profile_public(uuid) to authenticated;
grant execute on function public.get_sitter_public_reviews(uuid, int) to authenticated;
grant execute on function public.list_public_sitters_search() to authenticated;

notify pgrst, 'reload schema';
