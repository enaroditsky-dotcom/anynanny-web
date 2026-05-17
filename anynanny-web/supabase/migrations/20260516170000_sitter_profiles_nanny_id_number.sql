-- Optional alias column for public nanny serial (some environments use nanny_id_number).
alter table public.sitter_profiles
  add column if not exists nanny_id_number text;

comment on column public.sitter_profiles.nanny_id_number is
  'Public nanny serial (e.g. AN-1001). Mirrors nanny_serial when backfilled.';

update public.sitter_profiles
set nanny_id_number = nanny_serial
where nanny_id_number is null
  and nanny_serial is not null
  and trim(nanny_serial) <> '';

notify pgrst, 'reload schema';
