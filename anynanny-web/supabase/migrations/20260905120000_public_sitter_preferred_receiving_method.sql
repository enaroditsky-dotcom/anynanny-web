-- Expose only the sitter's preferred receiving-method enum on the public profile RPC.
-- Safe display field: bit | paybox | bank | card | cash | null.
-- Does not expose phones, PayBox links, bank account data, or card details.
-- Does not change RLS or table grants.

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
  ln text;
  first_n text;
  last_n text;
  combined text;
  ay integer;
  show_full boolean;
  show_age_flag boolean;
  birth date;
  preferred_raw text;
  preferred_method text;
begin
  if public.is_account_suspended(target_id) then
    return null::jsonb;
  end if;

  if auth.uid() is not null and public.is_blocked_pair(auth.uid(), target_id) then
    return null::jsonb;
  end if;

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

  first_n := nullif(trim(spj->>'first_name'), '');
  last_n := nullif(trim(spj->>'last_name'), '');
  combined := nullif(trim(concat_ws(' ', first_n, last_n)), '');

  show_full := coalesce((spj->>'show_full_name')::boolean, false);
  if show_full then
    dn := combined;
    ln := last_n;
  else
    dn := first_n;
    ln := null;
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

  preferred_raw := lower(nullif(trim(spj->>'payout_preferred_method'), ''));
  preferred_method := case
    when preferred_raw in ('bit', 'paybox', 'bank', 'card', 'cash') then preferred_raw
    else null
  end;

  return jsonb_build_object(
    'id', (spj->>'id')::uuid,
    'first_name', first_n,
    'last_name', ln,
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
    'avatar_url', photo,
    'payout_preferred_method', coalesce(
      case
        when preferred_method in ('bit', 'paybox', 'bank', 'card', 'cash') then preferred_method
        else null
      end,
      null
    )
  );
end;
$$;

comment on function public.get_sitter_profile_public(uuid) is
  'Public sitter profile JSON. Includes preferred receiving-method enum only. Hides suspended and mutually blocked sitters. last_name/display_name respect show_full_name.';

revoke all on function public.get_sitter_profile_public(uuid) from public;
revoke all on function public.get_sitter_profile_public(uuid) from anon;
grant execute on function public.get_sitter_profile_public(uuid) to authenticated;

notify pgrst, 'reload schema';
