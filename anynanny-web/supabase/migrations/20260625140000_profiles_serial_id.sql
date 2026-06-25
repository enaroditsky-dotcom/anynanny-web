-- Sequential public display ids: frontend renders P-{serial_id + 1000} / AN-{serial_id + 1000}.

alter table public.profiles add column if not exists serial_id bigint;

with ordered as (
  select
    id,
    row_number() over (order by coalesce(created_at, updated_at) nulls last, id) as rn
  from public.profiles
  where serial_id is null
)
update public.profiles p
   set serial_id = ordered.rn
  from ordered
 where p.id = ordered.id
   and p.serial_id is null;

create sequence if not exists public.profiles_serial_id_seq;

select setval(
  'public.profiles_serial_id_seq',
  greatest(1, coalesce((select max(serial_id) from public.profiles), 1))
);

alter table public.profiles
  alter column serial_id set default nextval('public.profiles_serial_id_seq');

alter sequence public.profiles_serial_id_seq owned by public.profiles.serial_id;

create unique index if not exists profiles_serial_id_key
  on public.profiles (serial_id)
  where serial_id is not null;

comment on column public.profiles.serial_id is
  'Auto-incrementing row serial for public display ids (P-/AN- + serial_id + 1000 on the client).';

notify pgrst, 'reload schema';
