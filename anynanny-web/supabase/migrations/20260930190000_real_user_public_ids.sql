-- Real-user public IDs for registrations after this migration.
--
-- Parents:    profiles.parent_serial is the canonical public id.
--             existing P-#### stay; new parents receive RP-1001, RP-1002, ...
--             public_id is mirrored only when it is empty or already a parent id.
--             No parent id column is added.
-- Babysitters: sitter_profiles.nanny_serial (mirrored to nanny_id_number)
--             existing AN-#### and historical CONS-#### stay.
--             every new sitter, including an expert, receives permanent RAN-1001, RAN-1002, ...
-- Expert service types do not choose or replace the public id. There is no
-- separate consultant-serial column; CONS- was a prefix of this same id.
--
-- Assignment stays on the existing BEFORE INSERT/UPDATE triggers and ensure RPCs.
-- There is no second client-side generator. Clients cannot pick a number:
-- a stored canonical id is kept, and a missing id is taken from nextval.
--
-- Concurrency: nextval() is atomic in PostgreSQL. Two simultaneous inserts
-- receive different sequence values even if both transactions commit, and a
-- rolled-back transaction does not hand its value to someone else. The next
-- number is not derived from the highest stored id or from a row count.
-- The exists() loop only skips a value that is already stored.

create sequence if not exists public.real_parent_public_id_seq
  start with 1001
  increment by 1
  minvalue 1
  no cycle;

create sequence if not exists public.real_sitter_public_id_seq
  start with 1001
  increment by 1
  minvalue 1
  no cycle;

comment on sequence public.real_parent_public_id_seq is
  'Atomic counter for new real parent public ids. First nextval() is 1001 (RP-1001).';

comment on sequence public.real_sitter_public_id_seq is
  'Atomic counter for new real babysitter public ids. First nextval() is 1001 (RAN-1001).';

comment on column public.profiles.parent_serial is
  'Permanent public parent id. Existing rows keep P-####. New parents receive RP-#### from real_parent_public_id_seq.';

comment on column public.sitter_profiles.nanny_serial is
  'Permanent public sitter id. Existing rows keep AN-#### or CONS-####. New sitters, including experts, receive RAN-####. Service changes never replace it.';

-- Normalize a value already stored in the database. Bare digits stay on the
-- legacy P- / AN- forms so an old row is not rewritten onto the real sequences.
-- Returns null when the value is not a public id we already issued.

create or replace function public.normalize_parent_public_id(p_raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_raw is null or btrim(p_raw) = '' then null
    when btrim(p_raw) ~* '^RP-[0-9]+$' then 'RP-' || substring(btrim(p_raw) from 4)
    when btrim(p_raw) ~* '^RP_[0-9]+$' then 'RP-' || substring(btrim(p_raw) from 4)
    when btrim(p_raw) ~* '^P-[0-9]+$' then 'P-' || substring(btrim(p_raw) from 3)
    when btrim(p_raw) ~* '^P_[0-9]+$' then 'P-' || substring(btrim(p_raw) from 3)
    when btrim(p_raw) ~ '^[0-9]+$' then 'P-' || btrim(p_raw)
    else null
  end;
$$;

create or replace function public.normalize_sitter_public_id(p_raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_raw is null or btrim(p_raw) = '' then null
    when btrim(p_raw) ~* '^RAN-[0-9]+$' then 'RAN-' || substring(btrim(p_raw) from 5)
    when btrim(p_raw) ~* '^RAN_[0-9]+$' then 'RAN-' || substring(btrim(p_raw) from 5)
    when btrim(p_raw) ~* '^CONS-[0-9]+$' then 'CONS-' || substring(btrim(p_raw) from 6)
    when btrim(p_raw) ~* '^CONS_[0-9]+$' then 'CONS-' || substring(btrim(p_raw) from 6)
    when btrim(p_raw) ~* '^AN-[0-9]+$' then 'AN-' || substring(btrim(p_raw) from 4)
    when btrim(p_raw) ~* '^AN_[0-9]+$' then 'AN-' || substring(btrim(p_raw) from 4)
    when btrim(p_raw) ~ '^[0-9]+$' then 'AN-' || btrim(p_raw)
    else null
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
    v_candidate := 'RP-' || nextval('public.real_parent_public_id_seq')::text;
    exit when not exists (
      select 1
      from public.profiles p
      where upper(trim(coalesce(p.parent_serial, ''))) = upper(v_candidate)
         or (
           p.role = 'parent'
           and upper(trim(coalesce(p.public_id, ''))) = upper(v_candidate)
         )
    );
  end loop;
  return v_candidate;
end;
$$;

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
    v_candidate := 'RAN-' || nextval('public.real_sitter_public_id_seq')::text;
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

create or replace function public.assign_public_sitter_serial(p_is_expert boolean)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- The public id is not an expert serial. p_is_expert cannot select CONS-.
  perform p_is_expert;
  return public.generate_nanny_serial();
end;
$$;

create or replace function public.assign_parent_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_id text;
begin
  if tg_op = 'UPDATE' then
    v_existing := public.normalize_parent_public_id(old.parent_serial);
    if v_existing is null
       and old.public_id is not null
       and btrim(old.public_id) ~* '^(P|RP)-[0-9]+$' then
      v_existing := public.normalize_parent_public_id(old.public_id);
    end if;
  else
    v_existing := null;
  end if;

  -- Keep a parent id that was already issued, including when the role changes.
  if v_existing is not null then
    new.parent_serial := v_existing;
    if new.public_id is null
       or btrim(new.public_id) = ''
       or btrim(new.public_id) ~* '^(P|RP)-[0-9]+$' then
      new.public_id := v_existing;
    end if;
    return new;
  end if;

  if new.role is distinct from 'parent' then
    return new;
  end if;

  -- First assignment. Ignore any client-supplied parent_serial.
  v_id := public.generate_parent_public_id();
  new.parent_serial := v_id;
  if new.public_id is null
     or btrim(new.public_id) = ''
     or btrim(new.public_id) ~* '^(P|RP)-[0-9]+$' then
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

create or replace function public.assign_sitter_nanny_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
begin
  if tg_op = 'UPDATE' then
    v_existing := public.normalize_sitter_public_id(old.nanny_serial);
    if v_existing is null then
      v_existing := public.normalize_sitter_public_id(old.nanny_id_number);
    end if;
  else
    -- Inserts ignore client-supplied serials. The redundant INSERT-only trigger
    -- was removed so this body runs once and consumes a single nextval().
    v_existing := null;
  end if;

  -- Canonical public id is permanent. AN-, RAN-, and historical CONS- are never
  -- rewritten because service_types become expert or stop being expert.
  if v_existing is null then
    new.nanny_serial := public.generate_nanny_serial();
  else
    new.nanny_serial := v_existing;
  end if;

  if tg_op = 'INSERT'
     or new.nanny_id_number is null
     or btrim(coalesce(new.nanny_id_number, '')) = ''
     or public.normalize_sitter_public_id(new.nanny_id_number) is not null
     or (
       tg_op = 'UPDATE'
       and public.normalize_sitter_public_id(old.nanny_id_number)
           is not distinct from public.normalize_sitter_public_id(old.nanny_serial)
     ) then
    new.nanny_id_number := new.nanny_serial;
  end if;

  return new;
end;
$$;

drop trigger if exists sitter_profiles_assign_nanny_serial on public.sitter_profiles;
create trigger sitter_profiles_assign_nanny_serial
  before insert or update of nanny_serial, nanny_id_number, service_types
  on public.sitter_profiles
  for each row
  execute function public.assign_sitter_nanny_serial();

-- INSERT already fires the trigger above. A second BEFORE INSERT trigger would
-- allocate a second id if the first call ignored the client value.
drop trigger if exists sitter_profiles_assign_nanny_serial_ins on public.sitter_profiles;

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
  v_serial text;
  v_public text;
  v_next text;
begin
  if uid is null then
    return null;
  end if;

  select role,
         parent_serial,
         public_id
    into v_role, v_serial, v_public
  from public.profiles
  where id = uid;

  if v_role is distinct from 'parent' then
    return null;
  end if;

  v_existing := public.normalize_parent_public_id(v_serial);
  if v_existing is null and v_public is not null and btrim(v_public) ~* '^(P|RP)-[0-9]+$' then
    v_existing := public.normalize_parent_public_id(v_public);
  end if;

  if v_existing is not null then
    update public.profiles
       set parent_serial = v_existing,
           public_id = case
             when public_id is null
               or btrim(public_id) = ''
               or btrim(public_id) ~* '^(P|RP)-[0-9]+$'
               then v_existing
             else public_id
           end,
           updated_at = now()
     where id = uid
       and parent_serial is distinct from v_existing;
    return v_existing;
  end if;

  -- Missing id: the BEFORE UPDATE trigger assigns the next RP- value once.
  update public.profiles
     set parent_serial = null,
         updated_at = now()
   where id = uid
     and role = 'parent';

  select nullif(trim(parent_serial), '')
    into v_next
  from public.profiles
  where id = uid;

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
  v_role text;
  v_existing text;
  v_next text;
begin
  if uid is null then
    return null;
  end if;

  -- Signup and role selection store profiles.role = 'sitter'.
  select role
    into v_role
  from public.profiles
  where id = uid;

  if v_role is distinct from 'sitter' then
    return null;
  end if;

  -- Insert only when missing. ON CONFLICT DO NOTHING still runs BEFORE INSERT
  -- triggers, which would burn a public id and then discard it.
  begin
    insert into public.sitter_profiles (id, updated_at)
    select uid, now()
    where not exists (
      select 1 from public.sitter_profiles existing where existing.id = uid
    );
  exception
    when unique_violation then
      null;
  end;

  select coalesce(nullif(trim(sp.nanny_serial), ''), nullif(trim(sp.nanny_id_number), ''))
    into v_existing
  from public.sitter_profiles sp
  where sp.id = uid;

  v_existing := public.normalize_sitter_public_id(v_existing);

  if v_existing is not null then
    return v_existing;
  end if;

  -- Missing id only. The trigger performs the only nextval() and writes RAN-.
  -- A stored AN-, RAN-, or CONS- id is returned above and is not replaced.
  update public.sitter_profiles
     set nanny_serial = null,
         updated_at = now()
   where id = uid;

  select nullif(trim(sp.nanny_serial), '')
    into v_next
  from public.sitter_profiles sp
  where sp.id = uid;

  return v_next;
end;
$$;

comment on function public.generate_parent_public_id() is
  'Next real parent public id (RP-####) via real_parent_public_id_seq. Not callable by anon/authenticated.';

comment on function public.generate_nanny_serial() is
  'Next permanent real sitter public id (RAN-####) via real_sitter_public_id_seq. Expert service types do not change this id.';

comment on function public.ensure_parent_public_id() is
  'Returns the caller''s existing P-#### or RP-####. Assigns the next RP-#### only when the parent row has no public id.';

comment on function public.ensure_sitter_nanny_serial() is
  'For profiles.role = sitter, returns the existing AN-/RAN-/CONS- id or assigns RAN-#### when missing. Any other role returns null and does not write sitter_profiles.';

revoke all on function public.normalize_parent_public_id(text) from public;
revoke all on function public.normalize_sitter_public_id(text) from public;
revoke all on function public.generate_parent_public_id() from public;
revoke all on function public.generate_nanny_serial() from public;
revoke all on function public.assign_public_sitter_serial(boolean) from public;

revoke all on sequence public.real_parent_public_id_seq from public;
revoke all on sequence public.real_sitter_public_id_seq from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.normalize_parent_public_id(text) from anon';
    execute 'revoke all on function public.normalize_sitter_public_id(text) from anon';
    execute 'revoke all on function public.generate_parent_public_id() from anon';
    execute 'revoke all on function public.generate_nanny_serial() from anon';
    execute 'revoke all on function public.assign_public_sitter_serial(boolean) from anon';
    execute 'revoke all on sequence public.real_parent_public_id_seq from anon';
    execute 'revoke all on sequence public.real_sitter_public_id_seq from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.normalize_parent_public_id(text) from authenticated';
    execute 'revoke all on function public.normalize_sitter_public_id(text) from authenticated';
    execute 'revoke all on function public.generate_parent_public_id() from authenticated';
    execute 'revoke all on function public.generate_nanny_serial() from authenticated';
    execute 'revoke all on function public.assign_public_sitter_serial(boolean) from authenticated';
    execute 'revoke all on sequence public.real_parent_public_id_seq from authenticated';
    execute 'revoke all on sequence public.real_sitter_public_id_seq from authenticated';
    execute 'grant execute on function public.ensure_parent_public_id() to authenticated';
    execute 'grant execute on function public.ensure_sitter_nanny_serial() to authenticated';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generate_consultant_serial'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'revoke all on function public.generate_consultant_serial() from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'revoke all on function public.generate_consultant_serial() from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'revoke all on function public.generate_consultant_serial() from authenticated';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
