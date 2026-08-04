-- Run in Supabase SQL Editor if `profiles` already exists without these columns.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists balance numeric(12, 2) not null default 0;

-- Replace trigger function to populate first_name + last_name + balance on new auth users.
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
