-- Close public reads of public.profiles.
--
-- Production has a permissive SELECT policy "Allow public read" (USING true,
-- TO public) that is not defined in this repository. Combined with anon SELECT
-- grants, it exposes phone, home address, identity numbers, and child medical
-- details through the Data API.
--
-- This migration:
--   * keeps each authenticated user on their own row
--   * drops permissive SELECT and ALL policies that are not strict owner checks
--   * revokes anon and PUBLIC table privileges, then re-grants authenticated
--   * adds booking-scoped RPCs for display names and service address
--
-- Owner checks recognized here are equality of id (and, for parent_profiles,
-- user_id) with auth.uid(), including "(select auth.uid())", either side, and
-- OR of those checks. A policy such as "auth.uid() is not null" is removed.
-- Restrictive policies are left in place. An owner policy with a different
-- shape would also be removed; confirm the live catalog before staging.
--
-- parent_profiles is optional and is not created in this repository. An owner
-- policy is created only for id and/or user_id columns whose type is uuid or
-- a domain over uuid. Other shapes are not given a generated predicate.
--
-- Address is not returned for status pending. It is returned only to the
-- assigned sitter while the booking is approved and still in progress
-- (approved, sitter_started, parent_started, sitter_ended) and cancelled_at
-- is null. completed, rejected, cancelled, and the missed-shift statuses do
-- not justify a home address. The latest bookings_status_check is
-- 20260830120000_missed_shift_clarification.sql.
--
-- Display RPCs never return phone, address, identity_id_number, children, or
-- child medical columns. Search, notifications, messages, and service_role
-- admin access are unchanged.
--
-- Not applied to Production by this change. Rollback:
-- sql/rollback_profiles_private_select.sql
-- That rollback restores the public read. Use it only to recover a broken release.

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    execute $policy$
      create policy "profiles_insert_own"
        on public.profiles
        for insert
        to authenticated
        with check (id = (select auth.uid()))
    $policy$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    execute $policy$
      create policy "profiles_update_own"
        on public.profiles
        for update
        to authenticated
        using (id = (select auth.uid()))
        with check (id = (select auth.uid()))
    $policy$;
  end if;
end
$$;

-- Names and public ids for someone who shares a booking with the caller.
-- Any booking status is enough for a name. Private columns are not selected.
create or replace function public.booking_partner_display(p_user_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  identity_verified boolean,
  parent_serial text,
  public_id text,
  serial_id bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;

  if coalesce(pg_catalog.array_length(p_user_ids, 1), 0) = 0 then
    return;
  end if;

  if pg_catalog.array_length(p_user_ids, 1) > 100 then
    raise exception 'booking profile lookup exceeds 100 ids';
  end if;

  return query
  select
    p.id,
    p.first_name,
    p.last_name,
    nullif(pg_catalog.btrim(p.avatar_url), ''),
    coalesce(p.identity_verification_status, 'unverified') = 'verified',
    p.parent_serial,
    p.public_id,
    p.serial_id
  from public.profiles p
  where p.id = any (p_user_ids)
    and (
      p.id = (select auth.uid())
      or exists (
        select 1
        from public.bookings b
        where (b.parent_id = (select auth.uid()) and b.sitter_id = p.id)
           or (b.sitter_id = (select auth.uid()) and b.parent_id = p.id)
      )
    );
end;
$$;

comment on function public.booking_partner_display(uuid[]) is
  'Booking-participant display card. Returns name, avatar, public id, and a verified boolean. Does not return phone, address, identity number, children, or medical details.';

revoke all on function public.booking_partner_display(uuid[]) from public;
revoke all on function public.booking_partner_display(uuid[]) from anon;
revoke all on function public.booking_partner_display(uuid[]) from authenticated;
grant execute on function public.booking_partner_display(uuid[]) to authenticated;

-- Street, house number, and city only. Apartment, floor, door code, and notes
-- stored inside profiles.address are not projected.
create or replace function public.booking_parent_service_addresses(p_parent_ids uuid[])
returns table (
  parent_id uuid,
  address jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;

  if coalesce(pg_catalog.array_length(p_parent_ids, 1), 0) = 0 then
    return;
  end if;

  if pg_catalog.array_length(p_parent_ids, 1) > 100 then
    raise exception 'booking address lookup exceeds 100 ids';
  end if;

  return query
  select p.id, projected.address
  from public.profiles p
  cross join lateral (
    select case
      when p.address is null then null::jsonb
      when pg_catalog.jsonb_typeof(p.address) = 'object' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'city', nullif(pg_catalog.btrim(coalesce(p.address->>'city', p.address->>'cityName', p.address->>'city_name', '')), ''),
        'street', nullif(pg_catalog.btrim(coalesce(p.address->>'street', p.address->>'streetName', p.address->>'street_name', '')), ''),
        'houseNumber', nullif(pg_catalog.btrim(coalesce(
          p.address->>'houseNumber',
          p.address->>'house_number',
          p.address->>'number',
          p.address->>'house',
          ''
        )), '')
      ))
      when pg_catalog.jsonb_typeof(p.address) = 'string' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'city', nullif(pg_catalog.btrim(p.address #>> '{}'), '')
      ))
      else null::jsonb
    end as address
  ) projected
  where p.id = any (p_parent_ids)
    and projected.address is not null
    and projected.address <> '{}'::jsonb
    and (
      p.id = (select auth.uid())
      or exists (
        select 1
        from public.bookings b
        where b.parent_id = p.id
          and b.sitter_id = (select auth.uid())
          and b.cancelled_at is null
          and b.status in (
            'approved',
            'sitter_started',
            'parent_started',
            'sitter_ended'
          )
      )
    );
end;
$$;

comment on function public.booking_parent_service_addresses(uuid[]) is
  'Service address (city, street, house number) for the parent themselves, or for the assigned sitter only after approval and only while the shift is still in progress. Pending, rejected, cancelled, completed, and missed-shift statuses return no row.';

revoke all on function public.booking_parent_service_addresses(uuid[]) from public;
revoke all on function public.booking_parent_service_addresses(uuid[]) from anon;
revoke all on function public.booking_parent_service_addresses(uuid[]) from authenticated;
grant execute on function public.booking_parent_service_addresses(uuid[]) to authenticated;

-- Session-local classifier. True only for owner equalities on the supplied
-- columns. Dropped automatically when the migration session ends.
create or replace function pg_temp.rls_expr_is_owner_only(p_expr text, p_columns text[])
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $owner_only$
declare
  compact text;
  part text;
  column_name text;
begin
  if p_expr is null or p_columns is null or cardinality(p_columns) = 0 then
    return false;
  end if;

  compact := lower(p_expr);
  compact := regexp_replace(compact, '\s+', '', 'g');
  compact := replace(compact, '(', '');
  compact := replace(compact, ')', '');
  compact := replace(compact, '"', '');
  -- pg_get_expr prints "(SELECT auth.uid() AS uid)".
  compact := replace(compact, 'auth.uidasuid', 'auth.uid');

  if compact = '' or compact = 'true' then
    return false;
  end if;

  foreach part in array regexp_split_to_array(compact, 'or') loop
    if part = '' then
      return false;
    end if;

    foreach column_name in array p_columns loop
      if part = column_name || '=auth.uid'
         or part = column_name || '=selectauth.uid'
         or part = 'auth.uid=' || column_name
         or part = 'selectauth.uid=' || column_name then
        column_name := null;
        exit;
      end if;
    end loop;

    if column_name is not null then
      return false;
    end if;
  end loop;

  return true;
end
$owner_only$;

drop policy if exists "Allow public read" on public.profiles;

do $$
declare
  r record;
begin
  for r in
    select pol.polname, pg_get_expr(pol.polqual, pol.polrelid) as qual
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and pol.polpermissive
      and pol.polcmd in ('r', '*')
  loop
    if not pg_temp.rls_expr_is_owner_only(r.qual, array['id']) then
      execute format('drop policy %I on public.profiles', r.polname);
    end if;
  end loop;
end
$$;

revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;

do $$
declare
  r record;
  owner_name text;
begin
  select pg_get_userbyid(c.relowner)
    into owner_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profiles';

  for r in
    select rol.rolname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    join pg_roles rol on rol.oid = a.grantee
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and a.privilege_type = 'SELECT'
      and rol.rolname not in ('authenticated', 'service_role')
      and rol.rolname is distinct from owner_name
  loop
    execute format('revoke select on table public.profiles from %I', r.rolname);
  end loop;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and c.relforcerowsecurity
  ) then
    raise warning 'public.profiles has FORCE ROW LEVEL SECURITY. Booking RPCs owned by the table owner will not see another user''s row until that setting is reviewed.';
  end if;

  execute format(
    'alter function public.booking_partner_display(uuid[]) owner to %I',
    owner_name
  );
  execute format(
    'alter function public.booking_parent_service_addresses(uuid[]) owner to %I',
    owner_name
  );
end
$$;

grant select, insert, update on table public.profiles to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.profiles to service_role';
  end if;
end
$$;

-- Legacy parent_profiles is not created in this repository. The application
-- no longer reads it. Lock world-readable policies when the table exists.
-- Generate an owner predicate only for uuid (or uuid-domain) id / user_id.
do $parent_profiles$
declare
  r record;
  uuid_columns text[] := array[]::text[];
  using_expr text;
  owner_name text;
  qual_compact text;
begin
  if to_regclass('public.parent_profiles') is null then
    return;
  end if;

  execute 'alter table public.parent_profiles enable row level security';
  execute 'revoke all on table public.parent_profiles from public';
  execute 'revoke all on table public.parent_profiles from anon';

  select coalesce(array_agg(a.attname order by a.attname), array[]::text[])
    into uuid_columns
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  left join pg_type base on base.oid = t.typbasetype and t.typtype = 'd'
  where n.nspname = 'public'
    and c.relname = 'parent_profiles'
    and a.attname in ('id', 'user_id')
    and a.attnum > 0
    and not a.attisdropped
    and (t.typname = 'uuid' or base.typname = 'uuid');

  for r in
    select pol.polname, pg_get_expr(pol.polqual, pol.polrelid) as qual
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'parent_profiles'
      and pol.polpermissive
      and pol.polcmd in ('r', '*')
  loop
    qual_compact := replace(replace(replace(
      lower(regexp_replace(coalesce(r.qual, 'true'), '\s+', '', 'g')),
      '(', ''), ')', ''), '"', '');

    if cardinality(uuid_columns) > 0 then
      if not pg_temp.rls_expr_is_owner_only(r.qual, uuid_columns) then
        execute format('drop policy %I on public.parent_profiles', r.polname);
      end if;
    elsif r.qual is null or qual_compact = 'true' then
      execute format('drop policy %I on public.parent_profiles', r.polname);
    end if;
  end loop;

  if cardinality(uuid_columns) > 0
     and not exists (
       select 1
       from pg_policies
       where schemaname = 'public'
         and tablename = 'parent_profiles'
         and policyname = 'parent_profiles_select_own'
     ) then
    using_expr := null;
    if 'id' = any (uuid_columns) then
      using_expr := 'id = (select auth.uid())';
    end if;
    if 'user_id' = any (uuid_columns) then
      using_expr := case
        when using_expr is null then 'user_id = (select auth.uid())'
        else using_expr || ' or user_id = (select auth.uid())'
      end;
    end if;

    execute format(
      'create policy parent_profiles_select_own on public.parent_profiles for select to authenticated using (%s)',
      using_expr
    );
  end if;

  execute 'grant select on table public.parent_profiles to authenticated';

  select pg_get_userbyid(c.relowner)
    into owner_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'parent_profiles';

  for r in
    select rol.rolname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    join pg_roles rol on rol.oid = a.grantee
    where n.nspname = 'public'
      and c.relname = 'parent_profiles'
      and a.privilege_type = 'SELECT'
      and rol.rolname not in ('authenticated', 'service_role')
      and rol.rolname is distinct from owner_name
  loop
    execute format('revoke select on table public.parent_profiles from %I', r.rolname);
  end loop;
end
$parent_profiles$;

notify pgrst, 'reload schema';
