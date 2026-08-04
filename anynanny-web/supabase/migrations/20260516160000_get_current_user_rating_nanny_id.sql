-- Add sitter public serial to get_current_user_rating (nanny_id_number).
-- Run in Supabase, then: NOTIFY pgrst, 'reload schema';

create or replace function public.get_current_user_rating()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_avg numeric;
  v_cnt integer;
  v_nanny_id text;
begin
  if uid is null then
    return json_build_object(
      'avg_rating', null,
      'rating_count', 0,
      'nanny_id_number', null
    );
  end if;

  select round(avg(r.rating)::numeric, 2), count(*)::integer
    into v_avg, v_cnt
  from public.ratings r
  where r.to_user_id = uid;

  select coalesce(
      nullif(trim(sp.nanny_id_number), ''),
      nullif(trim(sp.nanny_serial), '')
    )
    into v_nanny_id
  from public.sitter_profiles sp
  where sp.id = uid;

  return json_build_object(
    'avg_rating', v_avg,
    'rating_count', coalesce(v_cnt, 0),
    'nanny_id_number', v_nanny_id
  );
end;
$$;

comment on function public.get_current_user_rating is
  'Returns { avg_rating, rating_count, nanny_id_number } for auth.uid().';

notify pgrst, 'reload schema';
