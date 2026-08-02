-- Repair: restore generate_nanny_serial() and harden AN-/CONS- assignment.
-- Remote DBs may have expert CONS triggers without the babysitter generator.

create sequence if not exists public.nanny_serial_seq;
create sequence if not exists public.consultant_serial_seq;

do $$
begin
  perform setval('public.nanny_serial_seq', 1000, true)
  where not exists (
    select 1 from public.sitter_profiles where nanny_serial ~ '^AN-[0-9]+$'
  );
exception when others then
  null;
end $$;

do $$
begin
  perform setval('public.consultant_serial_seq', 1000, true)
  where not exists (
    select 1 from public.sitter_profiles where nanny_serial ~ '^CONS-[0-9]+$'
  );
exception when others then
  null;
end $$;

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

-- Safe chooser used by triggers / ensure RPCs.
create or replace function public.assign_public_sitter_serial(p_is_expert boolean)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if coalesce(p_is_expert, false) then
    return public.generate_consultant_serial();
  end if;
  return public.generate_nanny_serial();
end;
$$;

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
    new.nanny_serial := public.assign_public_sitter_serial(v_is_expert);
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
  else
    if v_existing is not null and v_existing ~ '^AN-[0-9]+$' then
      return v_existing;
    end if;
  end if;

  if v_existing is not null and v_existing ~ '^[0-9]+$' then
    v_next := case when v_is_expert then 'CONS-' || v_existing else 'AN-' || v_existing end;
  else
    v_next := public.assign_public_sitter_serial(v_is_expert);
  end if;

  update public.sitter_profiles
     set nanny_serial = v_next,
         nanny_id_number = v_next,
         updated_at = now()
   where id = uid;

  return v_next;
end;
$$;

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

grant execute on function public.generate_nanny_serial() to authenticated;
grant execute on function public.generate_consultant_serial() to authenticated;
grant execute on function public.assign_public_sitter_serial(boolean) to authenticated;
grant execute on function public.ensure_sitter_nanny_serial() to authenticated;
grant execute on function public.sitter_has_expert_service_types(text[]) to authenticated;

notify pgrst, 'reload schema';
