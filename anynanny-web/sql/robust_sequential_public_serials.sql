-- Robust sequential public serials by registration order.
-- Sitters:  AN-1001, AN-1002, ...  (sitter_profiles.nanny_serial)
-- Parents:  P-1001,  P-1002,  ...  (profiles.parent_public_id + profiles.parent_serial)
--
-- Uses PostgreSQL sequences + BEFORE INSERT/UPDATE triggers.
-- Also backfills any missing IDs and advances sequences to max(existing).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.sitter_profiles add column if not exists nanny_serial text;
alter table public.sitter_profiles add column if not exists nanny_id_number text;

alter table public.profiles add column if not exists parent_public_id text;
alter table public.profiles add column if not exists parent_serial text;
alter table public.profiles add column if not exists public_id text;
alter table public.profiles add column if not exists serial_id bigint;

comment on column public.sitter_profiles.nanny_serial is
  'Sequential public sitter id (AN-1001+), assigned by nanny_serial_seq on insert.';
comment on column public.profiles.parent_public_id is
  'Sequential public parent id (P-1001+), assigned by parent_public_id_seq.';
comment on column public.profiles.parent_serial is
  'UI alias of parent_public_id (kept in sync by trigger).';

create unique index if not exists sitter_profiles_nanny_serial_key
  on public.sitter_profiles (nanny_serial)
  where nanny_serial is not null;

create unique index if not exists profiles_parent_public_id_key
  on public.profiles (parent_public_id)
  where parent_public_id is not null;

create unique index if not exists profiles_parent_serial_key
  on public.profiles (parent_serial)
  where parent_serial is not null;

-- ---------------------------------------------------------------------------
-- Sequences (start at 1001 so first id is AN-1001 / P-1001)
-- ---------------------------------------------------------------------------
create sequence if not exists public.nanny_serial_seq;
create sequence if not exists public.parent_public_id_seq;

-- Prefer start 1001 when sequences are brand new (setval below corrects live max).
do $$
begin
  perform setval('public.nanny_serial_seq', 1000, true)
  where not exists (
    select 1 from public.sitter_profiles where nanny_serial ~ '^AN-[0-9]+$'
  );
  perform setval('public.parent_public_id_seq', 1000, true)
  where not exists (
    select 1 from public.profiles where parent_public_id ~ '^P-[0-9]+$' or parent_serial ~ '^P-[0-9]+$'
  );
exception when others then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- Generators (collision-safe)
-- ---------------------------------------------------------------------------
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
            upper(v_candidate)
         or upper(regexp_replace(trim(coalesce(sp.nanny_id_number, '')), '\s+', '', 'g')) =
            upper(v_candidate)
    );
  end loop;
  return v_candidate;
end;
$$;

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
      select 1
      from public.profiles p
      where upper(trim(coalesce(p.parent_public_id, ''))) = upper(v_candidate)
         or upper(trim(coalesce(p.parent_serial, ''))) = upper(v_candidate)
         or (
           p.role = 'parent'
           and upper(trim(coalesce(p.public_id, ''))) = upper(v_candidate)
         )
    );
  end loop;
  return v_candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.assign_sitter_nanny_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nanny_serial is null or btrim(new.nanny_serial) = '' then
    new.nanny_serial := public.generate_nanny_serial();
  else
    -- Normalize bare digits → AN-####
    if new.nanny_serial ~ '^[0-9]+$' then
      new.nanny_serial := 'AN-' || new.nanny_serial;
    end if;
  end if;

  if new.nanny_id_number is null or btrim(new.nanny_id_number) = '' then
    new.nanny_id_number := new.nanny_serial;
  end if;

  return new;
end;
$$;

drop trigger if exists sitter_profiles_assign_nanny_serial on public.sitter_profiles;
create trigger sitter_profiles_assign_nanny_serial
  before insert or update of nanny_serial, nanny_id_number on public.sitter_profiles
  for each row
  execute function public.assign_sitter_nanny_serial();

-- Also fire on plain INSERT when columns omitted (of … can skip bare insert in some PG versions).
drop trigger if exists sitter_profiles_assign_nanny_serial_ins on public.sitter_profiles;
create trigger sitter_profiles_assign_nanny_serial_ins
  before insert on public.sitter_profiles
  for each row
  execute function public.assign_sitter_nanny_serial();

create or replace function public.assign_parent_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if new.role is distinct from 'parent' then
    return new;
  end if;

  v_id := nullif(btrim(coalesce(new.parent_public_id, '')), '');
  if v_id is null then
    v_id := nullif(btrim(coalesce(new.parent_serial, '')), '');
  end if;
  if v_id is null and new.public_id is not null and btrim(new.public_id) ~ '^P-[0-9]+$' then
    v_id := btrim(new.public_id);
  end if;

  if v_id is null then
    v_id := public.generate_parent_public_id();
  elsif v_id ~ '^[0-9]+$' then
    v_id := 'P-' || v_id;
  end if;

  new.parent_public_id := v_id;
  new.parent_serial := v_id;
  -- Keep unified public_id in sync when present / empty.
  if new.public_id is null or btrim(new.public_id) = '' or btrim(new.public_id) ~ '^P-[0-9]+$' then
    new.public_id := v_id;
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
-- Backfill missing / non-canonical ids via sequences (collision-safe)
-- ---------------------------------------------------------------------------

update public.sitter_profiles sp
   set nanny_serial = public.generate_nanny_serial(),
       updated_at = now()
 where sp.nanny_serial is null
    or btrim(sp.nanny_serial) = ''
    or sp.nanny_serial !~ '^AN-[0-9]+$';

update public.sitter_profiles
   set nanny_id_number = nanny_serial,
       updated_at = now()
 where nanny_serial is not null
   and btrim(nanny_serial) <> ''
   and (nanny_id_number is null or btrim(nanny_id_number) = '' or nanny_id_number is distinct from nanny_serial);

update public.profiles p
   set parent_public_id = public.generate_parent_public_id(),
       updated_at = now()
 where p.role = 'parent'
   and (
     coalesce(nullif(btrim(p.parent_public_id), ''), nullif(btrim(p.parent_serial), ''), '') = ''
     or coalesce(nullif(btrim(p.parent_public_id), ''), nullif(btrim(p.parent_serial), '')) !~ '^P-[0-9]+$'
   );

-- Mirror parent_serial ↔ parent_public_id for already-good rows
update public.profiles
   set parent_serial = parent_public_id,
       public_id = coalesce(nullif(btrim(public_id), ''), parent_public_id),
       updated_at = now()
 where role = 'parent'
   and parent_public_id is not null
   and btrim(parent_public_id) <> ''
   and (
     parent_serial is distinct from parent_public_id
     or public_id is null
     or btrim(public_id) = ''
   );

update public.profiles
   set parent_public_id = parent_serial,
       updated_at = now()
 where role = 'parent'
   and parent_serial is not null
   and btrim(parent_serial) <> ''
   and parent_serial ~ '^P-[0-9]+$'
   and (parent_public_id is null or btrim(parent_public_id) = '');

-- Advance sequences past current max
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

select setval(
  'public.parent_public_id_seq',
  greatest(
    1000,
    coalesce(
      (select max((substring(coalesce(parent_public_id, parent_serial) from 3))::integer)
         from public.profiles
        where coalesce(parent_public_id, parent_serial) ~ '^P-[0-9]+$'),
      1000
    )
  )
);

-- ---------------------------------------------------------------------------
-- Ensure RPCs for dashboards (assign if missing, return canonical id)
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

  select role,
         coalesce(nullif(trim(parent_public_id), ''), nullif(trim(parent_serial), ''), nullif(trim(public_id), ''))
    into v_role, v_existing
  from public.profiles
  where id = uid;

  if v_role is distinct from 'parent' then
    return null;
  end if;

  if v_existing is not null and v_existing ~ '^P-[0-9]+$' then
    update public.profiles
       set parent_public_id = v_existing,
           parent_serial = v_existing,
           public_id = coalesce(nullif(trim(public_id), ''), v_existing),
           updated_at = now()
     where id = uid
       and (
         parent_public_id is distinct from v_existing
         or parent_serial is distinct from v_existing
       );
    return v_existing;
  end if;

  v_next := public.generate_parent_public_id();

  update public.profiles
     set parent_public_id = v_next,
         parent_serial = v_next,
         public_id = coalesce(nullif(trim(public_id), ''), v_next),
         updated_at = now()
   where id = uid
     and role = 'parent';

  return v_next;
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

  if v_existing is not null and v_existing ~ '^AN-[0-9]+$' then
    return v_existing;
  end if;

  if v_existing is not null and v_existing ~ '^[0-9]+$' then
    v_next := 'AN-' || v_existing;
    update public.sitter_profiles
       set nanny_serial = v_next,
           nanny_id_number = coalesce(nullif(trim(nanny_id_number), ''), v_next),
           updated_at = now()
     where id = uid;
    return v_next;
  end if;

  v_next := public.generate_nanny_serial();

  update public.sitter_profiles
     set nanny_serial = v_next,
         nanny_id_number = coalesce(nullif(trim(nanny_id_number), ''), v_next),
         updated_at = now()
   where id = uid
     and (nanny_serial is null or btrim(nanny_serial) = '' or nanny_serial !~ '^AN-[0-9]+$');

  select coalesce(nullif(trim(sp.nanny_serial), ''), nullif(trim(sp.nanny_id_number), ''))
    into v_existing
  from public.sitter_profiles sp
  where sp.id = uid;

  return coalesce(v_existing, v_next);
end;
$$;

grant execute on function public.generate_nanny_serial() to authenticated;
grant execute on function public.generate_parent_public_id() to authenticated;
grant execute on function public.ensure_parent_public_id() to authenticated;
grant execute on function public.ensure_sitter_nanny_serial() to authenticated;

comment on function public.ensure_parent_public_id is
  'Returns sequential P-#### for auth.uid() parent; assigns on first call.';
comment on function public.ensure_sitter_nanny_serial is
  'Returns sequential AN-#### for auth.uid() sitter; assigns on first call.';

notify pgrst, 'reload schema';
