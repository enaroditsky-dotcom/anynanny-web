-- Expert / consultant public serials: CONS-1001, CONS-1002, ...
-- Stored on sitter_profiles.nanny_serial (shared column; AN- remains for babysitters).

-- ---------------------------------------------------------------------------
-- Sequence
-- ---------------------------------------------------------------------------
create sequence if not exists public.consultant_serial_seq;

do $$
begin
  perform setval('public.consultant_serial_seq', 1000, true)
  where not exists (
    select 1 from public.sitter_profiles where nanny_serial ~ '^CONS-[0-9]+$'
  );
exception when others then
  null;
end $$;

comment on column public.sitter_profiles.nanny_serial is
  'Sequential public id: AN-#### for babysitters, CONS-#### for experts (lactation / sleep / doula).';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.sitter_has_expert_service_types(p_types text[])
returns boolean
language sql
immutable
as $$
  select coalesce(p_types, '{}'::text[]) && array[
    'lactation_consultant',
    'sleep_consultant',
    'doula'
  ]::text[];
$$;

create or replace function public.generate_consultant_serial()
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
    v_candidate := 'CONS-' || nextval('public.consultant_serial_seq')::text;
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

-- ---------------------------------------------------------------------------
-- Trigger: choose AN- vs CONS- from service_types; upgrade AN→CONS on expert update
-- ---------------------------------------------------------------------------
create or replace function public.assign_sitter_nanny_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_expert boolean;
  v_serial text;
begin
  v_is_expert := public.sitter_has_expert_service_types(new.service_types);
  v_serial := nullif(btrim(coalesce(new.nanny_serial, '')), '');

  -- Expert profiles must not keep a babysitter AN- serial.
  if v_is_expert and v_serial is not null and v_serial ~ '^AN-[0-9]+$' then
    v_serial := null;
  end if;

  -- Non-experts must not keep a CONS- serial.
  if not v_is_expert and v_serial is not null and v_serial ~ '^CONS-[0-9]+$' then
    v_serial := null;
  end if;

  if v_serial is null then
    new.nanny_serial := case
      when v_is_expert then public.generate_consultant_serial()
      else public.generate_nanny_serial()
    end;
  else
    if v_serial ~ '^[0-9]+$' then
      new.nanny_serial := case
        when v_is_expert then 'CONS-' || v_serial
        else 'AN-' || v_serial
      end;
    elsif v_serial ~* '^CONS_[0-9]+$' then
      new.nanny_serial := 'CONS-' || substring(v_serial from 6);
    elsif v_serial ~* '^AN_[0-9]+$' then
      new.nanny_serial := 'AN-' || substring(v_serial from 4);
    else
      new.nanny_serial := v_serial;
    end if;
  end if;

  if new.nanny_id_number is null or btrim(coalesce(new.nanny_id_number, '')) = '' then
    new.nanny_id_number := new.nanny_serial;
  elsif tg_op = 'UPDATE'
     and new.nanny_serial is distinct from old.nanny_serial
     and (
       old.nanny_id_number is not distinct from old.nanny_serial
       or coalesce(old.nanny_id_number, '') ~ '^(AN|CONS)-[0-9]+$'
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

drop trigger if exists sitter_profiles_assign_nanny_serial_ins on public.sitter_profiles;
create trigger sitter_profiles_assign_nanny_serial_ins
  before insert on public.sitter_profiles
  for each row
  execute function public.assign_sitter_nanny_serial();

-- ---------------------------------------------------------------------------
-- ensure_sitter_nanny_serial: return CONS- for experts, AN- for babysitters
-- ---------------------------------------------------------------------------
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
  v_types text[];
  v_is_expert boolean;
  v_next text;
begin
  if uid is null then
    return null;
  end if;

  insert into public.sitter_profiles (id, updated_at)
  values (uid, now())
  on conflict (id) do nothing;

  select
    coalesce(nullif(trim(sp.nanny_serial), ''), nullif(trim(sp.nanny_id_number), '')),
    coalesce(sp.service_types, array['babysitter']::text[])
    into v_existing, v_types
  from public.sitter_profiles sp
  where sp.id = uid;

  v_is_expert := public.sitter_has_expert_service_types(v_types);

  if v_is_expert then
    if v_existing is not null and v_existing ~ '^CONS-[0-9]+$' then
      return v_existing;
    end if;
    v_next := public.generate_consultant_serial();
  else
    if v_existing is not null and v_existing ~ '^AN-[0-9]+$' then
      return v_existing;
    end if;
    if v_existing is not null and v_existing ~ '^[0-9]+$' then
      v_next := 'AN-' || v_existing;
    else
      v_next := public.generate_nanny_serial();
    end if;
  end if;

  update public.sitter_profiles
     set nanny_serial = v_next,
         nanny_id_number = v_next,
         updated_at = now()
   where id = uid;

  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: existing expert rows still on AN- → CONS-
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_next text;
begin
  for r in
    select sp.id
      from public.sitter_profiles sp
     where public.sitter_has_expert_service_types(sp.service_types)
       and (
         sp.nanny_serial is null
         or btrim(sp.nanny_serial) = ''
         or sp.nanny_serial ~ '^AN-[0-9]+$'
       )
  loop
    v_next := public.generate_consultant_serial();
    update public.sitter_profiles
       set nanny_serial = v_next,
           nanny_id_number = v_next,
           updated_at = now()
     where id = r.id;
  end loop;
end $$;

select setval(
  'public.consultant_serial_seq',
  greatest(
    1000,
    coalesce(
      (select max((substring(nanny_serial from 6))::integer)
         from public.sitter_profiles
        where nanny_serial ~ '^CONS-[0-9]+$'),
      1000
    )
  )
);

grant execute on function public.generate_consultant_serial() to authenticated;
grant execute on function public.sitter_has_expert_service_types(text[]) to authenticated;

comment on function public.generate_consultant_serial is
  'Returns sequential CONS-#### for expert sitters (lactation / sleep / doula).';
comment on function public.ensure_sitter_nanny_serial is
  'Returns AN-#### for babysitters or CONS-#### for experts; assigns on first call.';

notify pgrst, 'reload schema';
