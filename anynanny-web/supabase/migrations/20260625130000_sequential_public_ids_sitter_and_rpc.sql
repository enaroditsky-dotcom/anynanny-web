-- Sequential public IDs: P-1001+ on profiles, AN-1001+ on sitter_profiles, plus ensure RPCs.
-- Re-orders existing rows so hash/placeholder ids (e.g. P-8170) become true sequences.

-- ---------------------------------------------------------------------------
-- Parent sequence (idempotent with 20260625120000_profiles_parent_public_id.sql)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists parent_public_id text;

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

-- ---------------------------------------------------------------------------
-- Sitter serial sequence + trigger on sitter_profiles
-- ---------------------------------------------------------------------------
alter table public.sitter_profiles add column if not exists nanny_serial text;
alter table public.sitter_profiles add column if not exists nanny_id_number text;

create sequence if not exists public.nanny_serial_seq start 1001;

create or replace function public.generate_nanny_serial()
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
    v_candidate := 'AN-' || nextval('public.nanny_serial_seq')::text;
    exit when not exists (
      select 1
      from public.sitter_profiles sp
      where upper(regexp_replace(trim(coalesce(sp.nanny_serial, '')), '\s+', '', 'g')) =
            upper(regexp_replace(trim(v_candidate), '\s+', '', 'g'))
    );
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.assign_sitter_nanny_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nanny_serial is null or btrim(new.nanny_serial) = '' then
    new.nanny_serial := public.generate_nanny_serial();
  end if;
  if new.nanny_id_number is null or btrim(new.nanny_id_number) = '' then
    new.nanny_id_number := new.nanny_serial;
  end if;
  return new;
end;
$$;

drop trigger if exists sitter_profiles_assign_nanny_serial on public.sitter_profiles;
create trigger sitter_profiles_assign_nanny_serial
  before insert or update on public.sitter_profiles
  for each row
  execute function public.assign_sitter_nanny_serial();

-- ---------------------------------------------------------------------------
-- One-time reorder: stable sequential ids by account age
-- ---------------------------------------------------------------------------
with ordered_parents as (
  select
    id,
    row_number() over (order by coalesce(created_at, updated_at) nulls last, id) + 1000 as n
  from public.profiles
  where role = 'parent'
)
update public.profiles p
   set parent_public_id = 'P-' || ordered_parents.n::text,
       updated_at = now()
  from ordered_parents
 where p.id = ordered_parents.id;

with ordered_sitters as (
  select
    sp.id,
    row_number() over (order by coalesce(sp.updated_at, sp.onboarding_completed_at) nulls last, sp.id) + 1000 as n
  from public.sitter_profiles sp
)
update public.sitter_profiles sp
   set nanny_serial = 'AN-' || ordered_sitters.n::text,
       nanny_id_number = 'AN-' || ordered_sitters.n::text,
       updated_at = now()
  from ordered_sitters
 where sp.id = ordered_sitters.id;

select setval(
  'public.parent_public_id_seq',
  greatest(
    1000,
    coalesce(
      (select max((substring(parent_public_id from 3))::integer)
         from public.profiles
        where parent_public_id ~ '^P-[0-9]+$'),
      1000
    )
  )
);

select setval(
  'public.nanny_serial_seq',
  greatest(
    1000,
    coalesce(
      (select max((substring(nanny_serial from 4))::integer)
         from public.sitter_profiles
        where nanny_serial ~ '^AN-[0-9]+$'),
      1000
    )
  )
);

-- ---------------------------------------------------------------------------
-- RPC: assign + return sequential id for the signed-in user
-- ---------------------------------------------------------------------------
create or replace function public.ensure_parent_public_id()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_role text;
  v_existing text;
  v_next text;
begin
  if uid is null then
    return null;
  end if;

  select role, nullif(trim(parent_public_id), '')
    into v_role, v_existing
  from public.profiles
  where id = uid;

  if v_role is distinct from 'parent' then
    return null;
  end if;

  if v_existing is not null then
    return v_existing;
  end if;

  v_next := public.generate_parent_public_id();

  update public.profiles
     set parent_public_id = v_next,
         updated_at = now()
   where id = uid
     and role = 'parent'
     and (parent_public_id is null or btrim(parent_public_id) = '');

  select nullif(trim(parent_public_id), '')
    into v_existing
  from public.profiles
  where id = uid;

  return coalesce(v_existing, v_next);
end;
$$;

create or replace function public.ensure_sitter_nanny_serial()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_existing text;
  v_next text;
begin
  if uid is null then
    return null;
  end if;

  insert into public.sitter_profiles (id, updated_at)
  values (uid, now())
  on conflict (id) do nothing;

  select coalesce(nullif(trim(sp.nanny_serial), ''), nullif(trim(sp.nanny_id_number), ''))
    into v_existing
  from public.sitter_profiles sp
  where sp.id = uid;

  if v_existing is not null then
    return v_existing;
  end if;

  v_next := public.generate_nanny_serial();

  update public.sitter_profiles
     set nanny_serial = v_next,
         nanny_id_number = v_next,
         updated_at = now()
   where id = uid
       and (nanny_serial is null or btrim(nanny_serial) = '');

  select coalesce(nullif(trim(sp.nanny_serial), ''), nullif(trim(sp.nanny_id_number), ''))
    into v_existing
  from public.sitter_profiles sp
  where sp.id = uid;

  return coalesce(v_existing, v_next);
end;
$$;

grant execute on function public.ensure_parent_public_id() to authenticated;
grant execute on function public.ensure_sitter_nanny_serial() to authenticated;

comment on function public.ensure_parent_public_id is
  'Returns sequential P-#### for auth.uid() parent; assigns on first call.';

comment on function public.ensure_sitter_nanny_serial is
  'Returns sequential AN-#### for auth.uid() sitter; assigns on first call.';

notify pgrst, 'reload schema';
