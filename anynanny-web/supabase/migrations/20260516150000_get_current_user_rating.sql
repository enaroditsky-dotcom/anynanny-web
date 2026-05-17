-- Current user's aggregate rating (parent or sitter) for dashboard badge.
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
begin
  if uid is null then
    return json_build_object('avg_rating', null, 'rating_count', 0);
  end if;

  select round(avg(r.rating)::numeric, 2), count(*)::integer
    into v_avg, v_cnt
  from public.ratings r
  where r.to_user_id = uid;

  return json_build_object(
    'avg_rating', v_avg,
    'rating_count', coalesce(v_cnt, 0)
  );
end;
$$;

revoke all on function public.get_current_user_rating() from public;
grant execute on function public.get_current_user_rating() to authenticated;

comment on function public.get_current_user_rating is
  'Returns { avg_rating, rating_count } for auth.uid() from session ratings received.';

notify pgrst, 'reload schema';
