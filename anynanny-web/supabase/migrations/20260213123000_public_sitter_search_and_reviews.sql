-- Parent marketplace: public sitter list (sorted by rating) + anonymized reviews.
-- Run in Supabase SQL Editor or `supabase db push`.

-- ---------------------------------------------------------------------------
-- Public profile JSON: include aggregate rating fields (from sitter_profiles).
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
begin
  select * into sp from public.sitter_profiles where id = target_id;
  if not found then return null::jsonb; end if;

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
    'rating_count', coalesce(sp.rating_count, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Last N text reviews toward a sitter (no from_user_id — privacy).
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
-- Search cards: public sitters only, highest avg_rating first.
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
        'display_name',
        case
          when coalesce(sp.show_full_name, false) then nullif(trim(sp.full_name), '')
          else nullif(split_part(trim(coalesce(sp.full_name, '')), ' ', 1), '')
        end,
        'years_experience', sp.years_experience,
        'bio', sp.bio,
        'hourly_rate_nis', sp.hourly_rate_nis,
        'avg_rating', sp.avg_rating,
        'rating_count', coalesce(sp.rating_count, 0)
      )
      order by sp.avg_rating desc nulls last, sp.rating_count desc nulls last, sp.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.sitter_profiles sp
  where coalesce(sp.is_public, false) = true;
$$;

grant execute on function public.get_sitter_public_reviews(uuid, int) to authenticated;
grant execute on function public.list_public_sitters_search() to authenticated;

notify pgrst, 'reload schema';
