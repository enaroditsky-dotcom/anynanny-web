-- Session ratings (double-sided trust). Run in Supabase SQL Editor after `sessions` + `sitter_profiles` exist.
-- Then: NOTIFY pgrst, 'reload schema';

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (session_id, from_user_id)
);

create index if not exists ratings_to_user_id_idx on public.ratings (to_user_id);
create index if not exists ratings_session_id_idx on public.ratings (session_id);

comment on table public.ratings is 'Post-session rating from one participant to the other; one row per session per rater.';

alter table public.sitter_profiles
  add column if not exists avg_rating numeric(4, 2),
  add column if not exists rating_count integer not null default 0;

comment on column public.sitter_profiles.avg_rating is 'Average of all ratings where to_user_id = sitter id; maintained by trigger.';
comment on column public.sitter_profiles.rating_count is 'Count of ratings toward this sitter.';

create or replace function public.refresh_sitter_avg_rating_for_user(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric;
  v_cnt integer;
begin
  if target_user is null then
    return;
  end if;
  select round(avg(r.rating)::numeric, 2), count(*)::integer
    into v_avg, v_cnt
  from public.ratings r
  where r.to_user_id = target_user;

  update public.sitter_profiles sp
  set
    avg_rating = v_avg,
    rating_count = coalesce(v_cnt, 0),
    updated_at = now()
  where sp.id = target_user;
end;
$$;

create or replace function public.trg_ratings_refresh_sitter_avg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_sitter_avg_rating_for_user(NEW.to_user_id);
  return NEW;
end;
$$;

drop trigger if exists ratings_after_insert_refresh_sitter_avg on public.ratings;
create trigger ratings_after_insert_refresh_sitter_avg
  after insert on public.ratings
  for each row
  execute procedure public.trg_ratings_refresh_sitter_avg();

alter table public.ratings enable row level security;

drop policy if exists "ratings_select_own" on public.ratings;
drop policy if exists "ratings_insert_participant" on public.ratings;
drop policy if exists "ratings_select_participant" on public.ratings;
drop policy if exists "ratings_insert_session_participant" on public.ratings;

create policy "ratings_select_participant"
  on public.ratings for select
  to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

create policy "ratings_insert_session_participant"
  on public.ratings for insert
  to authenticated
  with check (
    from_user_id = auth.uid()
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.status::text in ('completed', 'payment_pending', 'paid', 'sitter_completed')
        and (s.parent_id = auth.uid() or s.sitter_id = auth.uid())
        and (
          (
            s.parent_id = auth.uid()
            and s.sitter_id is not null
            and to_user_id = s.sitter_id
          )
          or (
            s.sitter_id = auth.uid()
            and s.parent_id is not null
            and to_user_id = s.parent_id
          )
        )
    )
  );

notify pgrst, 'reload schema';
