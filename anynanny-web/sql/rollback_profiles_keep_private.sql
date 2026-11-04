-- Privacy-preserving emergency path for 20261101125000_profiles_private_select.sql.
--
-- Run this instead of sql/rollback_profiles_private_select.sql.
-- That other file recreates "Allow public read" and grants SELECT to anon.
-- This file never does either of those things.
--
-- It keeps row level security on, keeps own-row policies, and restores
-- SELECT only for Supabase infrastructure roles the forward migration
-- revokes when they are not the table owner. anon and PUBLIC are revoked.
-- Arbitrary extra readers are not restored.
--
-- Booking RPCs are left in place when they already exist. Reverting the
-- Vercel deployment to 162de1a therefore hides sitter-facing names and
-- addresses, because that build reads public.profiles directly. Promoting
-- 959073e again uses the RPCs and does not require reapplying the migration.
--
-- Own-profile reads and writes, service_role, and the infrastructure grants
-- below stay available. Not for use as a way to reopen profile data.

begin;

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

alter table public.profiles enable row level security;

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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy "profiles_select_own"
      on public.profiles
      for select
      to authenticated
      using (id = (select auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy "profiles_insert_own"
      on public.profiles
      for insert
      to authenticated
      with check (id = (select auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy "profiles_update_own"
      on public.profiles
      for update
      to authenticated
      using (id = (select auth.uid()))
      with check (id = (select auth.uid()));
  end if;
end
$$;

revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.profiles to service_role';
  end if;
end
$$;

do $parent_profiles$
declare
  r record;
  uuid_columns text[] := array[]::text[];
  using_expr text;
  qual_compact text;
begin
  if to_regclass('public.parent_profiles') is null then
    return;
  end if;

  execute 'alter table public.parent_profiles enable row level security';
  execute 'revoke all on table public.parent_profiles from public';
  execute 'revoke all on table public.parent_profiles from anon';
  execute 'drop policy if exists "Allow public read" on public.parent_profiles';

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

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on table public.parent_profiles to service_role';
  end if;
end
$parent_profiles$;

-- Table owner and service_role are granted above or bypass grants as owner.
-- These roles are Supabase's own login and maintenance roles. Restoring
-- SELECT here undoes only the forward migration's revoke against them.
-- It does not grant anon, PUBLIC, or authenticated-wide cross-user reads.
do $infra$
declare
  role_name text;
  infra text[] := array[
    'postgres',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'supabase_replication_admin',
    'authenticator',
    'dashboard_user',
    'pgbouncer',
    'supabase_read_only_user'
  ];
begin
  foreach role_name in array infra loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('grant usage on schema public to %I', role_name);
      execute format('grant select on table public.profiles to %I', role_name);
      if to_regclass('public.parent_profiles') is not null then
        execute format('grant select on table public.parent_profiles to %I', role_name);
      end if;
    end if;
  end loop;
end
$infra$;

notify pgrst, 'reload schema';

commit;
