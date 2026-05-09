-- Run in Supabase SQL Editor if `profiles` already exists without these columns.

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists balance numeric(12, 2) not null default 0;

-- Replace trigger function to populate full_name + balance on new auth users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    0
  )
  on conflict (id) do update
    set role = excluded.role,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;
