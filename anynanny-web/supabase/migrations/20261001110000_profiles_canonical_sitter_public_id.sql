-- Canonical sitter public id lives on profiles.nanny_serial, matching
-- profiles.parent_serial for parents.
-- New sitters receive RAN-#### from real_sitter_public_id_seq.
-- sitter_profiles copies that value and does not allocate another id.
-- Stored AN / RAN / CONS values are kept. No backfill.

create sequence if not exists public.real_sitter_public_id_seq
  start with 1001
  increment by 1
  minvalue 1001
  no cycle;

comment on column public.profiles.nanny_serial is
  'Permanent public sitter id. Existing rows keep their stored id. New sitters receive RAN-#### from real_sitter_public_id_seq.';

comment on column public.sitter_profiles.nanny_serial is
  'Mirror of profiles.nanny_serial. This trigger does not allocate a new id.';

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
      from public.profiles p
      where upper(trim(coalesce(p.nanny_serial, ''))) = upper(v_candidate)
    )
    and not exists (
      select 1
      from public.sitter_profiles sp
      where upper(trim(coalesce(sp.nanny_serial, ''))) = upper(v_candidate)
         or upper(trim(coalesce(sp.nanny_id_number, ''))) = upper(v_candidate)
    );
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.assign_public_sitter_serial(p_is_expert boolean)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Allocation happens only in assign_nanny_public_id().
  perform p_is_expert;
  return null;
end;
$$;

create or replace function public.assign_nanny_public_id()
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
  else
    -- Inserts ignore a client-supplied serial.
    v_existing := null;
  end if;

  if v_existing is not null then
    new.nanny_serial := v_existing;
  elsif new.role = 'sitter' then
    new.nanny_serial := public.generate_nanny_serial();
  end if;

  -- Unrelated shell label. Skipped when that generator is not installed.
  if new.role = 'sitter'
     and to_regprocedure('public.generate_nanny_public_id()') is not null then
    if new.nanny_public_id is null or btrim(new.nanny_public_id) = '' then
      new.nanny_public_id := public.generate_nanny_public_id();
    end if;
  end if;

  return new;
end;
$$;

-- Legacy profiles triggers that could still mint a babysitter serial.
drop trigger if exists set_sitter_serial_trg on public.profiles;
drop trigger if exists set_sitter_serial_trigger on public.profiles;
drop trigger if exists trigger_assign_nanny_id on public.profiles;
drop trigger if exists profiles_assign_nanny_serial on public.profiles;

drop trigger if exists profiles_assign_nanny_public_id on public.profiles;
create trigger profiles_assign_nanny_public_id
  before insert or update
  on public.profiles
  for each row
  execute function public.assign_nanny_public_id();

create or replace function public.assign_sitter_nanny_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_canonical text;
begin
  if tg_op = 'UPDATE' then
    v_existing := public.normalize_sitter_public_id(old.nanny_serial);
    if v_existing is null then
      v_existing := public.normalize_sitter_public_id(old.nanny_id_number);
    end if;
  else
    v_existing := null;
  end if;

  if v_existing is not null then
    new.nanny_serial := v_existing;
  else
    select public.normalize_sitter_public_id(p.nanny_serial)
      into v_canonical
    from public.profiles p
    where p.id = new.id;

    new.nanny_serial := v_canonical;
  end if;

  if new.nanny_serial is not null
     and (
       tg_op = 'INSERT'
       or new.nanny_id_number is null
       or btrim(coalesce(new.nanny_id_number, '')) = ''
       or public.normalize_sitter_public_id(new.nanny_id_number) is not null
       or (
         tg_op = 'UPDATE'
         and public.normalize_sitter_public_id(old.nanny_id_number)
             is not distinct from public.normalize_sitter_public_id(old.nanny_serial)
       )
     ) then
    new.nanny_id_number := new.nanny_serial;
  end if;

  return new;
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
  v_serial text;
  v_existing text;
begin
  if uid is null then
    return null;
  end if;

  select role, nanny_serial
    into v_role, v_serial
  from public.profiles
  where id = uid;

  if v_role is distinct from 'sitter' then
    return null;
  end if;

  v_existing := public.normalize_sitter_public_id(v_serial);

  if v_existing is null then
    -- The profiles trigger performs the only sequence allocation.
    update public.profiles
       set nanny_serial = null,
           updated_at = now()
     where id = uid
       and role = 'sitter';

    select nanny_serial
      into v_serial
    from public.profiles
    where id = uid;

    v_existing := public.normalize_sitter_public_id(v_serial);
  end if;

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

  if v_existing is not null then
    update public.sitter_profiles
       set nanny_serial = null,
           updated_at = now()
     where id = uid
       and public.normalize_sitter_public_id(nanny_serial) is null
       and public.normalize_sitter_public_id(nanny_id_number) is null;
  end if;

  return v_existing;
end;
$$;

drop trigger if exists set_sitter_serial_trg on public.sitter_profiles;
drop trigger if exists set_sitter_serial_trigger on public.sitter_profiles;
drop trigger if exists trigger_assign_nanny_id on public.sitter_profiles;
drop trigger if exists sitter_profiles_assign_nanny_serial_ins on public.sitter_profiles;

drop trigger if exists sitter_profiles_assign_nanny_serial on public.sitter_profiles;
create trigger sitter_profiles_assign_nanny_serial
  before insert or update of nanny_serial, nanny_id_number, service_types
  on public.sitter_profiles
  for each row
  execute function public.assign_sitter_nanny_serial();

comment on function public.generate_nanny_serial() is
  'Next permanent real sitter public id (RAN-####) via real_sitter_public_id_seq. Called only from the profiles assignment trigger.';

comment on function public.assign_nanny_public_id() is
  'Assigns profiles.nanny_serial for a new sitter and keeps a stored id on update.';

comment on function public.ensure_sitter_nanny_serial() is
  'For profiles.role = sitter, returns profiles.nanny_serial and mirrors it onto sitter_profiles. Any other role returns null and does not allocate an id.';

revoke all on function public.generate_nanny_serial() from public;
revoke all on function public.assign_nanny_public_id() from public;
revoke all on function public.assign_sitter_nanny_serial() from public;
revoke all on function public.assign_public_sitter_serial(boolean) from public;
revoke all on sequence public.real_sitter_public_id_seq from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.generate_nanny_serial() from anon';
    execute 'revoke all on function public.assign_nanny_public_id() from anon';
    execute 'revoke all on function public.assign_sitter_nanny_serial() from anon';
    execute 'revoke all on function public.assign_public_sitter_serial(boolean) from anon';
    execute 'revoke all on sequence public.real_sitter_public_id_seq from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.generate_nanny_serial() from authenticated';
    execute 'revoke all on function public.assign_nanny_public_id() from authenticated';
    execute 'revoke all on function public.assign_sitter_nanny_serial() from authenticated';
    execute 'revoke all on function public.assign_public_sitter_serial(boolean) from authenticated';
    execute 'revoke all on sequence public.real_sitter_public_id_seq from authenticated';
    execute 'grant execute on function public.ensure_sitter_nanny_serial() to authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
