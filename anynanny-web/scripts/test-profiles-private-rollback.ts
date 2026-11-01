import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = "supabase/migrations/20261101125000_profiles_private_select.sql";
const dangerousPath = "sql/rollback_profiles_private_select.sql";
const keepPrivatePath = "sql/rollback_profiles_keep_private.sql";

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const migrationSql = read(migrationPath).replace(/notify\s+pgrst\s*,\s*'reload schema'\s*;/gi, "");
const dangerousSql = read(dangerousPath).replace(/notify\s+pgrst\s*,\s*'reload schema'\s*;/gi, "");
const keepPrivateSql = read(keepPrivatePath).replace(/notify\s+pgrst\s*,\s*'reload schema'\s*;/gi, "");
const keepPrivateSource = read(keepPrivatePath);

assert.doesNotMatch(keepPrivateSource, /grant\s+select\s+on\s+table\s+public\.profiles\s+to\s+anon/i);
assert.doesNotMatch(keepPrivateSource, /grant\s+select\s+on\s+table\s+public\.parent_profiles\s+to\s+anon/i);
assert.doesNotMatch(keepPrivateSource, /create\s+policy\s+"Allow public read"/i);
assert.doesNotMatch(keepPrivateSource, /drop\s+function\s+if\s+exists\s+public\.booking_partner_display/i);
assert.match(keepPrivateSource, /revoke all on table public\.profiles from anon/i);
assert.match(keepPrivateSource, /profiles_select_own/);
assert.match(keepPrivateSource, /grant select, insert, update, delete on table public\.profiles to service_role/);
assert.match(read(dangerousPath), /create policy "Allow public read"/);
assert.match(read(dangerousPath), /grant select on table public\.profiles to anon/);

const PARENT = "11111111-1111-4111-8111-111111111111";
const SITTER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";
const PHONE = "0501234567";

const fixtureSql = `
create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role profiles_reader nologin noinherit;
create role supabase_auth_admin nologin noinherit bypassrls;
create role authenticator nologin noinherit;
grant usage on schema public to anon, authenticated, service_role, profiles_reader, supabase_auth_admin, authenticator;

create table public.profiles (
  id uuid primary key,
  first_name text,
  last_name text,
  phone text,
  address jsonb,
  identity_id_number text,
  child_special_or_medical_details text,
  children jsonb,
  avatar_url text,
  identity_verification_status text,
  parent_serial text,
  public_id text,
  serial_id integer,
  role text
);
alter table public.profiles enable row level security;
create policy "Allow public read" on public.profiles for select to public using (true);
create policy profiles_any_logged_in on public.profiles
  for select to authenticated
  using (auth.uid() is not null);
create policy profiles_legacy_owner on public.profiles
  for select to authenticated
  using (auth.uid() = id);
create policy profiles_all_open on public.profiles
  for all to public
  using (true)
  with check (true);
grant select on public.profiles to anon, authenticated, service_role, profiles_reader, supabase_auth_admin, authenticator;
grant insert, update on public.profiles to authenticated;

create table public.bookings (
  id uuid primary key,
  parent_id uuid not null,
  sitter_id uuid not null,
  status text not null,
  cancelled_at timestamptz
);
grant select on public.bookings to authenticated, service_role;

create table public.parent_profiles (
  id uuid primary key,
  address text,
  children_ages text
);
alter table public.parent_profiles enable row level security;
create policy "Allow public read" on public.parent_profiles for select to public using (true);
create policy parent_profiles_address_open on public.parent_profiles
  for select to authenticated
  using (length(address) > 0);
grant select on public.parent_profiles to anon, authenticated, supabase_auth_admin, authenticator;

insert into public.profiles (
  id, first_name, last_name, phone, address, identity_id_number,
  child_special_or_medical_details, children, avatar_url,
  identity_verification_status, parent_serial, public_id, serial_id, role
) values (
  '${PARENT}', 'Dana', 'Levi', '${PHONE}',
  '{"city":"Haifa","street":"Hans","houseNumber":"41","apartment":"apt-9"}'::jsonb,
  '123456782', 'peanut-allergy-private', '[{"name":"Noa"}]'::jsonb,
  'https://example.test/a.png', 'verified', 'RP-1001', 'RP-1001', 7, 'parent'
), (
  '${SITTER}', 'Maya', 'Cohen', '0500000000', null, null, null, null,
  null, 'unverified', null, null, 8, 'sitter'
), (
  '${STRANGER}', 'Ron', 'Bar', '0509999999', null, null, null, null,
  null, 'unverified', null, null, 9, 'parent'
);
insert into public.bookings (id, parent_id, sitter_id, status)
values ('${BOOKING}', '${PARENT}', '${SITTER}', 'approved');
insert into public.parent_profiles (id, address, children_ages)
values ('${PARENT}', 'secret street 1', '4, 7');
`;

async function privilege(db: PGlite, role: string, table: string): Promise<boolean> {
  const result = await db.query<{ ok: boolean }>(
    `select has_table_privilege('${role}', '${table}', 'SELECT') as ok`
  );
  return result.rows[0]?.ok === true;
}

async function asRole<T>(
  db: PGlite,
  role: string,
  userId: string | null,
  run: () => Promise<T>
): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`);
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec(`reset role`);
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

async function publicSelectGrant(db: PGlite, table: string): Promise<boolean> {
  const result = await db.query<{ ok: boolean }>(`
    select exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public'
        and c.relname = '${table}'
        and a.grantee = 0
        and a.privilege_type = 'SELECT'
    ) as ok
  `);
  return result.rows[0]?.ok === true;
}

async function policyNames(db: PGlite, table: string): Promise<string[]> {
  const result = await db.query<{ polname: string }>(`
    select pol.polname
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = '${table}'
    order by pol.polname
  `);
  return result.rows.map((row) => row.polname);
}

async function main(): Promise<void> {
  const db = new PGlite();
  const contrast = new PGlite();
  try {
    await db.exec(fixtureSql);
    await db.exec(migrationSql);

    assert.equal(await privilege(db, "anon", "public.profiles"), false);
    assert.equal(await privilege(db, "supabase_auth_admin", "public.profiles"), false);
    assert.equal(await privilege(db, "authenticator", "public.profiles"), false);
    assert.equal(await privilege(db, "profiles_reader", "public.profiles"), false);

    await db.exec(keepPrivateSql);

    assert.equal(await privilege(db, "anon", "public.profiles"), false, "anon profiles");
    assert.equal(await privilege(db, "anon", "public.parent_profiles"), false, "anon parent_profiles");
    assert.equal(await publicSelectGrant(db, "profiles"), false);
    assert.equal(await publicSelectGrant(db, "parent_profiles"), false);
    assert.equal(await privilege(db, "profiles_reader", "public.profiles"), false);
    assert.equal(await privilege(db, "supabase_auth_admin", "public.profiles"), true);
    assert.equal(await privilege(db, "supabase_auth_admin", "public.parent_profiles"), true);
    assert.equal(await privilege(db, "authenticator", "public.profiles"), true);
    assert.equal(await privilege(db, "authenticated", "public.profiles"), true);
    assert.equal(await privilege(db, "service_role", "public.profiles"), true);
    assert.equal(await privilege(db, "service_role", "public.parent_profiles"), true);

    const policies = await policyNames(db, "profiles");
    assert.ok(policies.includes("profiles_select_own"));
    assert.ok(policies.includes("profiles_legacy_owner"));
    assert.equal(policies.includes("Allow public read"), false);
    assert.equal(policies.includes("profiles_any_logged_in"), false);
    assert.equal(policies.includes("profiles_all_open"), false);
    assert.deepEqual(await policyNames(db, "parent_profiles"), ["parent_profiles_select_own"]);

    const functions = await db.query<{ n: number }>(`
      select count(*)::int as n
      from pg_proc
      where proname in ('booking_partner_display', 'booking_parent_service_addresses')
    `);
    assert.equal(functions.rows[0]?.n, 2);

    await assert.rejects(
      () => asRole(db, "anon", null, () => db.query(`select phone from public.profiles`)),
      /permission denied/i
    );

    const own = await asRole(db, "authenticated", PARENT, () =>
      db.query<{ phone: string }>(`select phone from public.profiles where id = '${PARENT}'`)
    );
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0]?.phone, PHONE);

    const cross = await asRole(db, "authenticated", SITTER, () =>
      db.query(`select phone from public.profiles where id = '${PARENT}'`)
    );
    assert.equal(cross.rows.length, 0);

    const parentOwn = await asRole(db, "authenticated", PARENT, () =>
      db.query<{ address: string }>(`select address from public.parent_profiles`)
    );
    assert.equal(parentOwn.rows[0]?.address, "secret street 1");
    const parentCross = await asRole(db, "authenticated", SITTER, () =>
      db.query(`select address from public.parent_profiles`)
    );
    assert.equal(parentCross.rows.length, 0);

    const authenticatorRows = await asRole(db, "authenticator", null, () =>
      db.query(`select id from public.profiles`)
    );
    assert.equal(authenticatorRows.rows.length, 0);

    const admin = await asRole(db, "service_role", null, () =>
      db.query<{ phone: string }>(`select phone from public.profiles where id = '${PARENT}'`)
    );
    assert.equal(admin.rows[0]?.phone, PHONE);

    const infra = await asRole(db, "supabase_auth_admin", null, () =>
      db.query<{ phone: string }>(`select phone from public.profiles where id = '${PARENT}'`)
    );
    assert.equal(infra.rows[0]?.phone, PHONE);

    const card = await asRole(db, "authenticated", SITTER, () =>
      db.query<{ first_name: string; serial_id: number; serial_type: string }>(
        `select first_name, serial_id, pg_typeof(serial_id)::text as serial_type
         from public.booking_partner_display($1::uuid[])`,
        [[PARENT]]
      )
    );
    assert.equal(card.rows[0]?.first_name, "Dana");
    assert.equal(card.rows[0]?.serial_id, 7);
    assert.equal(card.rows[0]?.serial_type, "integer");
    const address = await asRole(db, "authenticated", SITTER, () =>
      db.query(`select parent_id from public.booking_parent_service_addresses($1::uuid[])`, [[PARENT]])
    );
    assert.equal(address.rows.length, 1);

    const updated = await asRole(db, "authenticated", PARENT, () =>
      db.query<{ first_name: string }>(
        `update public.profiles set first_name = 'Dana Updated' where id = '${PARENT}' returning first_name`
      )
    );
    assert.equal(updated.rows[0]?.first_name, "Dana Updated");

    await db.exec(`
      create policy "Allow public read" on public.profiles for select to public using (true);
      create policy "Allow public read" on public.parent_profiles for select to public using (true);
      grant select on table public.profiles to anon;
      grant select on table public.parent_profiles to anon;
    `);
    await db.exec(keepPrivateSql);
    assert.equal(await privilege(db, "anon", "public.profiles"), false);
    assert.equal(await privilege(db, "anon", "public.parent_profiles"), false);
    assert.equal((await policyNames(db, "profiles")).includes("Allow public read"), false);
    assert.equal((await policyNames(db, "parent_profiles")).includes("Allow public read"), false);
    assert.equal(await privilege(db, "supabase_auth_admin", "public.profiles"), true);
    assert.equal(await privilege(db, "profiles_reader", "public.profiles"), false);

    await contrast.exec(fixtureSql);
    await contrast.exec(migrationSql);
    await contrast.exec(dangerousSql);
    const reopened = await asRole(contrast, "anon", null, () =>
      contrast.query<{ phone: string }>(`select phone from public.profiles where id = '${PARENT}'`)
    );
    assert.equal(reopened.rows[0]?.phone, PHONE);
    await contrast.exec(keepPrivateSql);
    await assert.rejects(
      () => asRole(contrast, "anon", null, () => contrast.query(`select phone from public.profiles`)),
      /permission denied/i
    );
    const dropped = await contrast.query<{ n: number }>(`
      select count(*)::int as n
      from pg_proc
      where proname in ('booking_partner_display', 'booking_parent_service_addresses')
    `);
    assert.equal(dropped.rows[0]?.n, 0);
    await contrast.exec(migrationSql);
    const restored = await contrast.query<{ n: number }>(`
      select count(*)::int as n
      from pg_proc
      where proname in ('booking_partner_display', 'booking_parent_service_addresses')
    `);
    assert.equal(restored.rows[0]?.n, 2);
    assert.equal(await privilege(contrast, "anon", "public.profiles"), false);
    const repaired = await asRole(contrast, "authenticated", SITTER, () =>
      contrast.query<{ first_name: string }>(
        `select first_name from public.booking_partner_display($1::uuid[])`,
        [[PARENT]]
      )
    );
    assert.equal(repaired.rows[0]?.first_name, "Dana");

    console.log("engine=pglite");
    console.log("keep_private_rollback=pass");
    console.log("anon_select_after_keep_private=false");
    console.log("public_select_grant_after_keep_private=false");
    console.log("cross_user_select_after_keep_private=0");
    console.log("owner_select_after_keep_private=1");
    console.log("service_role_select_after_keep_private=true");
    console.log("supabase_auth_admin_select_restored=true");
    console.log("authenticator_cross_user_rows=0");
    console.log("profiles_reader_select_restored=false");
    console.log("booking_rpcs_preserved=2");
    console.log("sitter_rpc_name=Dana");
    console.log("sitter_rpc_address_rows=1");
    console.log("reopened_public_policy_closed_again=true");
    console.log("dangerous_rollback_restores_anon_select=true");
    console.log("dangerous_rollback_executed_against=disposable_pglite_only");
    console.log("after_dangerous_rollback_keep_private_closes_anon=true");
    console.log("forward_migration_reapplied_restores_rpc_without_anon=true");
  } finally {
    await db.close();
    await contrast.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
