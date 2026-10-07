-- One sitter public-id trigger. Legacy BEFORE triggers on sitter_profiles
-- still issued babysitter serials from the old sequence and overwrote RAN.
-- Those functions stay defined for historical callers, but they are no longer
-- attached. Existing AN / RAN / CONS values are not rewritten.

create sequence if not exists public.real_sitter_public_id_seq
  start with 1001
  increment by 1
  minvalue 1001
  no cycle;

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
    -- Inserts ignore a client-supplied serial. This trigger is the only
    -- assignment path, so the insert consumes a single nextval().
    v_existing := null;
  end if;

  -- A stored public id is permanent, including when service_types change.
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
  -- A stored historical id is returned above and is not replaced.
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
  'Next permanent real sitter public id (RAN-####) via real_sitter_public_id_seq. Expert service types do not change this id.';

comment on function public.ensure_sitter_nanny_serial() is
  'For profiles.role = sitter, returns the existing public id or assigns RAN-#### when missing. Any other role returns null and does not write sitter_profiles.';

revoke all on function public.generate_nanny_serial() from public;
revoke all on sequence public.real_sitter_public_id_seq from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.generate_nanny_serial() from anon';
    execute 'revoke all on sequence public.real_sitter_public_id_seq from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.generate_nanny_serial() from authenticated';
    execute 'revoke all on sequence public.real_sitter_public_id_seq from authenticated';
    execute 'grant execute on function public.ensure_sitter_nanny_serial() to authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
