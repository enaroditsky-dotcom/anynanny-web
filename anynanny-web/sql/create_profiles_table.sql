-- AnyNanny: profiles (role per user). Run in Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  role text not null check (role in ('parent', 'sitter')),
  balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile when a user signs up (reads role from raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, first_name, last_name, balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    0
  )
  on conflict (id) do update
    set role = excluded.role,
        first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name = coalesce(excluded.last_name, public.profiles.last_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
