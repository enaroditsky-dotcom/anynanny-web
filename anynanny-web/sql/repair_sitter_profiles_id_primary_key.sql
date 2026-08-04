-- Repair legacy / drifted sitter_profiles so `id uuid` exists as PK (matches create_sitter_profiles.sql).
-- Run in Supabase SQL Editor if you see: Could not find the 'id' column of 'sitter_profiles'.

alter table public.sitter_profiles
  add column if not exists id uuid references auth.users (id) on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'sitter_profiles'
      and c.contype = 'p'
  ) then
    alter table only public.sitter_profiles add constraint sitter_profiles_pkey primary key (id);
  end if;
exception
  when others then
    raise notice 'Could not add primary key on sitter_profiles(id): fix null/duplicate ids manually, then re-run.';
end;
$$;

notify pgrst, 'reload schema';
