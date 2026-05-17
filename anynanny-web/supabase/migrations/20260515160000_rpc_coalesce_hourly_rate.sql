-- Return hourly rate from hourly_rate_nis and/or legacy hourly_rate column (to_jsonb avoids missing-column errors).

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
