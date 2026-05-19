-- Fix duplicate / mismatched public nanny serials (run in Supabase SQL Editor).
-- Goal: one sitter profile → one unique `nanny_serial` (e.g. AN-1004).

-- 1) Inspect duplicates (normalized, case/space insensitive)
select
  upper(regexp_replace(trim(coalesce(nanny_serial, '')), '\s+', '', 'g')) as norm_serial,
  count(*) as profile_count,
  array_agg(id order by updated_at desc nulls last) as profile_ids,
  array_agg(coalesce(full_name, '(no name)') order by updated_at desc nulls last) as names
from public.sitter_profiles
where nanny_serial is not null
  and trim(nanny_serial) <> ''
group by 1
having count(*) > 1
order by 1;

-- 2) Rows where legacy mirror column disagrees with canonical serial
select
  id,
  full_name,
  nanny_serial,
  nanny_id_number
from public.sitter_profiles
where nanny_serial is not null
  and trim(nanny_serial) <> ''
  and nanny_id_number is not null
  and trim(nanny_id_number) <> ''
  and upper(regexp_replace(trim(nanny_serial), '\s+', '', 'g'))
    <> upper(regexp_replace(trim(nanny_id_number), '\s+', '', 'g'))
order by nanny_serial;

-- 3) Sync mirror column from canonical serial (safe default)
update public.sitter_profiles sp
set nanny_id_number = sp.nanny_serial
where sp.nanny_serial is not null
  and trim(sp.nanny_serial) <> ''
  and (
    sp.nanny_id_number is null
    or trim(sp.nanny_id_number) = ''
    or upper(regexp_replace(trim(sp.nanny_id_number), '\s+', '', 'g'))
      <> upper(regexp_replace(trim(sp.nanny_serial), '\s+', '', 'g'))
  );

-- 4) Assign unique serials to public profiles missing one (edit names/ids as needed)
--    Example: assign AN-1001, AN-1002, … in stable order.
with numbered as (
  select
    id,
    row_number() over (order by coalesce(updated_at, created_at) nulls last, id) + 1000 as n
  from public.sitter_profiles
  where is_public = true
    and (nanny_serial is null or trim(nanny_serial) = '')
)
update public.sitter_profiles sp
set
  nanny_serial = 'AN-' || numbered.n::text,
  nanny_id_number = 'AN-' || numbered.n::text
from numbered
where sp.id = numbered.id;

-- 5) Resolve true duplicates manually — example for second profile sharing AN-1004:
-- update public.sitter_profiles
-- set nanny_serial = 'AN-1010', nanny_id_number = 'AN-1010'
-- where id = '<uuid-of-duplicate-profile>';

-- 6) Enforce uniqueness going forward (partial unique index; skip if already exists)
create unique index if not exists sitter_profiles_nanny_serial_key
  on public.sitter_profiles (upper(regexp_replace(trim(nanny_serial), '\s+', '', 'g')))
  where nanny_serial is not null and trim(nanny_serial) <> '';

notify pgrst, 'reload schema';
