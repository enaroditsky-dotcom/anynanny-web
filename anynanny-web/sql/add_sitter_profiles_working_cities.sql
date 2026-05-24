-- Run in Supabase SQL Editor if PostgREST reports:
-- "Could not find the 'working_cities' column of 'sitter_profiles' in the schema cache"
--
-- Same as: supabase/migrations/20260523120000_sitter_profiles_working_cities.sql (column portion)

alter table public.sitter_profiles
  add column if not exists working_cities text[] not null default '{}';

comment on column public.sitter_profiles.working_cities is
  'Canonical city names from ISRAEL_CITIES; used for parent search .contains filter.';

notify pgrst, 'reload schema';
