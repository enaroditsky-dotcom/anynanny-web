-- Optional parent "special moments" (events). Run in Supabase SQL Editor after `auth.users` / `profiles` exist.

create table if not exists public.user_special_occasions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null,
  event_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists user_special_occasions_user_idx
  on public.user_special_occasions (user_id);

alter table public.user_special_occasions enable row level security;

drop policy if exists "user_special_occasions_select_own" on public.user_special_occasions;
create policy "user_special_occasions_select_own"
  on public.user_special_occasions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_special_occasions_insert_own" on public.user_special_occasions;
create policy "user_special_occasions_insert_own"
  on public.user_special_occasions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_special_occasions_update_own" on public.user_special_occasions;
create policy "user_special_occasions_update_own"
  on public.user_special_occasions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_special_occasions_delete_own" on public.user_special_occasions;
create policy "user_special_occasions_delete_own"
  on public.user_special_occasions for delete
  to authenticated
  using (auth.uid() = user_id);
