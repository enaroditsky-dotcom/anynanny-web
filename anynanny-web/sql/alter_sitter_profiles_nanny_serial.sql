-- Unique public nanny serial (e.g. AN-1001). Run in Supabase SQL Editor after sitter_profiles exists.

alter table public.sitter_profiles add column if not exists nanny_serial text;

create unique index if not exists sitter_profiles_nanny_serial_key
  on public.sitter_profiles (nanny_serial)
  where nanny_serial is not null;

comment on column public.sitter_profiles.nanny_serial is 'Stable public serial shown to parents (AN-xxxx).';
