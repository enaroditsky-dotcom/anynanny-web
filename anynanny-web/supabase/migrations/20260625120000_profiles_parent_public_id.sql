-- Public Parent ID system — assigns a human-friendly, unique public identifier (e.g. "P-1001")
-- to every parent (profiles.role = 'parent'), mirroring sitter nanny_serial (AN-####).
--
-- ADDITIVE ONLY: one nullable column, sequence, generator, trigger, backfill.

alter table public.profiles add column if not exists parent_public_id text;

comment on column public.profiles.parent_public_id is
  'Human-friendly public identifier for parents, e.g. "P-1001". Separate from the internal uuid PK.';

create unique index if not exists profiles_parent_public_id_key
  on public.profiles (parent_public_id)
  where parent_public_id is not null;

create sequence if not exists public.parent_public_id_seq start 1001;

create or replace function public.generate_parent_public_id()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_candidate text;
begin
  loop
    v_candidate := 'P-' || nextval('public.parent_public_id_seq')::text;
    exit when not exists (
      select 1 from public.profiles where parent_public_id = v_candidate
    );
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.assign_parent_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'parent'
     and (new.parent_public_id is null or btrim(new.parent_public_id) = '') then
    new.parent_public_id := public.generate_parent_public_id();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_parent_public_id on public.profiles;
create trigger profiles_assign_parent_public_id
  before insert or update on public.profiles
  for each row
  execute function public.assign_parent_public_id();

update public.profiles
   set parent_public_id = public.generate_parent_public_id()
 where role = 'parent'
   and (parent_public_id is null or btrim(parent_public_id) = '');

notify pgrst, 'reload schema';
