import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const migrationPath = "supabase/migrations/20261101125000_profiles_private_select.sql";
const rollbackPath = "sql/rollback_profiles_private_select.sql";
const migration = read(migrationPath);
const rollback = read(rollbackPath);
const migrationSql = migration.replace(/notify\s+pgrst\s*,\s*'reload schema'\s*;/gi, "");
const rollbackSql = rollback.replace(/notify\s+pgrst\s*,\s*'reload schema'\s*;/gi, "");

const PARENT = "11111111-1111-4111-8111-111111111111";
const SITTER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";
const PHONE = "0501234567";
const ID_NUMBER = "123456782";
const MEDICAL = "peanut-allergy-private";
const APARTMENT = "apt-9-door-4412";

const ADDRESS_ALLOWED = ["approved", "sitter_started", "parent_started", "sitter_ended"] as const;
const ADDRESS_DENIED = [
  "pending",
  "rejected",
  "cancelled",
  "completed",
  "awaiting_missed_shift_reason",
  "did_not_occur",
  "happened_unverified",
  "missed_shift_disputed"
] as const;

const CROSS_USER_FILES = [
  "lib/chat/booking-messages.ts",
  "lib/bookings/cancellation-attention.ts",
  "lib/bookings/sitter-pending-bookings.ts",
  "lib/bookings/sitter-confirmed-shifts.ts",
  "lib/bookings/todays-linked-booking.ts",
  "components/session/session-rating-modal.tsx",
  "app/sitter/shifts/page.tsx",
  "lib/ratings/repository.ts"
] as const;

assert.match(migration, /profiles_select_own/);
assert.match(migration, /booking_partner_display/);
assert.match(migration, /booking_parent_service_addresses/);
assert.match(migration, /security definer/);
assert.match(migration, /set search_path = pg_catalog, public/);
assert.match(migration, /pg_temp\.rls_expr_is_owner_only/);
assert.match(migration, /pol\.polcmd in \('r', '\*'\)/);
assert.match(migration, /t\.typname = 'uuid' or base\.typname = 'uuid'/);
assert.match(migration, /relforcerowsecurity/);
assert.match(migration, /alter function public\.booking_partner_display\(uuid\[\]\) owner to/);
assert.doesNotMatch(migration, /set search_path = public\b/);
assert.match(migration, /revoke all on function public\.booking_partner_display\(uuid\[\]\) from public/);
assert.match(migration, /revoke all on function public\.booking_partner_display\(uuid\[\]\) from anon/);
assert.match(migration, /grant execute on function public\.booking_partner_display\(uuid\[\]\) to authenticated/);
assert.match(migration, /revoke all on function public\.booking_parent_service_addresses\(uuid\[\]\) from anon/);
assert.match(migration, /revoke all on table public\.profiles from anon/);
assert.match(migration, /revoke all on table public\.profiles from public/);
assert.match(migration, /grant select, insert, update, delete on table public\.profiles to service_role/);
assert.doesNotMatch(migration, /grant execute on function public\.booking_partner_display\(uuid\[\]\) to anon/);
assert.doesNotMatch(migration, /grant execute on function public\.booking_parent_service_addresses\(uuid\[\]\) to anon/);
assert.doesNotMatch(migration, /grant select on table public\.profiles to anon/);
const displaySignature =
  migration.match(/function public\.booking_partner_display[\s\S]*?language plpgsql/i)?.[0] ?? "";
assert.ok(displaySignature);
assert.doesNotMatch(displaySignature, /phone|identity_id_number|child_special|children|address/i);
assert.doesNotMatch(migration, /drop policy if exists bookings_insert_parent/);
assert.doesNotMatch(migration, /list_public_sitters_search|get_sitter_profile_public/);
assert.doesNotMatch(migration, /create policy[^;]+for select[^;]+bookings/i);
assert.doesNotMatch(
  migration.match(/b\.status in \([\s\S]*?\)/)?.[0] ?? "",
  /'pending'|'rejected'|'cancelled'|'completed'|'awaiting_missed_shift_reason'|'did_not_occur'|'happened_unverified'|'missed_shift_disputed'/
);
for (const status of ADDRESS_ALLOWED) {
  assert.match(migration, new RegExp(`'${status}'`));
}
assert.match(migration, /cancelled_at is null/);

assert.match(rollback, /create policy "Allow public read"/);
assert.match(rollback, /grant select on table public\.profiles to anon/);
assert.match(rollback, /drop function if exists public\.booking_partner_display/);
assert.doesNotMatch(rollback, /drop policy if exists "profiles_select_own"/);
assert.doesNotMatch(rollback.replace(/--[^\n]*/g, ""), /parent_profiles|create policy "Allow public read"[\s\S]*profiles_select_own/);

for (const file of CROSS_USER_FILES) {
  const source = read(file);
  assert.doesNotMatch(
    source,
    /\.from\(\s*(?:PROFILES_TABLE|"profiles"|'profiles')\s*\)/,
    `${file} still reads public.profiles directly`
  );
  assert.match(source, /fetchBookingPartnerDisplays|listProfiles/);
}

const preview = read("app/api/sitter/bookings/[bookingId]/parent-preview/route.ts");
assert.match(preview, /fetchBookingPartnerDisplays/);
assert.match(preview, /fetchBookingParentServiceAddresses/);
assert.doesNotMatch(preview, /from\(\s*["']parent_profiles["']\s*\)/);
assert.doesNotMatch(preview, /identity_id_number|child_special_or_medical_details/);
assert.match(preview, /children_ages:\s*null/);
assert.match(preview, /\.from\(PROFILES_TABLE\)/);
assert.match(preview, /\.eq\(\s*"id",\s*user\.id\s*\)/);

assert.match(read("components/parent/parent-personal-area.tsx"), /from\(PROFILES_TABLE\)/);
assert.match(read("lib/sitter/parent-sitter-search.ts"), /list_public_sitters_search/);
assert.match(read("lib/sitter/fetch-parent-sitter-profile.ts"), /get_sitter_profile_public/);
assert.match(read("lib/chat/whatsapp-handoff-server.ts"), /getSupabaseServiceRoleClient/);
assert.match(read("lib/chat/whatsapp-handoff-server.ts"), /authorizeWhatsAppBooking/);
assert.match(read("lib/chat/whatsapp-handoff-server.ts"), /\.select\("phone"\)/);
assert.match(read("app/api/admin/reports/route.ts"), /getSupabaseServiceRoleClient/);
assert.match(read("lib/broadcast/now-request-details.ts"), /location_label/);
assert.doesNotMatch(read("lib/broadcast/now-request-details.ts"), /phone|identity_id_number|child_special/);
assert.match(
  read("supabase/migrations/20260822220000_sitter_profiles_private_select.sql"),
  /drop policy if exists "sitter_profiles_select_public_authenticated"/
);

async function assertParentProfilesSchemas(): Promise<void> {
  const textDb = new PGlite();
  try {
    await textDb.exec(`
      create schema if not exists auth;
      create or replace function auth.uid()
      returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create role anon nologin noinherit;
      create role authenticated nologin noinherit;
      grant usage on schema public to anon, authenticated;
      create table public.profiles (id uuid primary key);
      alter table public.profiles enable row level security;
      grant select on public.profiles to anon, authenticated;
      create table public.parent_profiles (id text primary key, address text);
      alter table public.parent_profiles enable row level security;
      create policy "Allow public read" on public.parent_profiles for select to public using (true);
      create policy parent_profiles_keep_custom on public.parent_profiles
        for select to authenticated using (id = 'keep-me');
      grant select on public.parent_profiles to anon, authenticated;
    `);
    await textDb.exec(migrationSql);
    const policies = await textDb.query<{ polname: string; qual: string | null }>(`
      select pol.polname, pg_get_expr(pol.polqual, pol.polrelid) as qual
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'parent_profiles'
    `);
    assert.deepEqual(
      policies.rows.map((row) => row.polname),
      ["parent_profiles_keep_custom"]
    );
    assert.ok(policies.rows.every((row) => !/auth\.uid\(\)/.test(row.qual ?? "")));
  } finally {
    await textDb.close();
  }

  const userIdDb = new PGlite();
  try {
    await userIdDb.exec(`
      create schema if not exists auth;
      create or replace function auth.uid()
      returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create role anon nologin noinherit;
      create role authenticated nologin noinherit;
      grant usage on schema public to anon, authenticated;
      create table public.profiles (id uuid primary key);
      alter table public.profiles enable row level security;
      grant select on public.profiles to authenticated;
      create table public.parent_profiles (user_id uuid primary key, address text);
      alter table public.parent_profiles enable row level security;
      create policy "Allow public read" on public.parent_profiles for select to public using (true);
      grant select on public.parent_profiles to anon, authenticated;
      insert into public.parent_profiles (user_id, address)
      values ('${PARENT}', 'user-id-address');
    `);
    await userIdDb.exec(migrationSql);
    const qual = await userIdDb.query<{ qual: string }>(`
      select pg_get_expr(pol.polqual, pol.polrelid) as qual
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'parent_profiles'
        and pol.polname = 'parent_profiles_select_own'
    `);
    assert.match(qual.rows[0]?.qual ?? "", /user_id/);
    assert.match(qual.rows[0]?.qual ?? "", /auth\.uid\(\)/);
    assert.doesNotMatch(qual.rows[0]?.qual ?? "", /(^|[^a-z_])id([^a-z_]|$)/i);
    await userIdDb.exec(`select set_config('request.jwt.claim.sub', '${PARENT}', false)`);
    await userIdDb.exec(`set role authenticated`);
    const own = await userIdDb.query<{ address: string }>(
      `select address from public.parent_profiles`
    );
    assert.equal(own.rows[0]?.address, "user-id-address");
    await userIdDb.exec(`reset role`);
    await userIdDb.exec(`select set_config('request.jwt.claim.sub', '${SITTER}', false)`);
    await userIdDb.exec(`set role authenticated`);
    const hidden = await userIdDb.query(`select address from public.parent_profiles`);
    assert.equal(hidden.rows.length, 0);
    await userIdDb.exec(`reset role`);
  } finally {
    await userIdDb.close();
  }
}

const db = new PGlite();

async function privilege(sql: string): Promise<boolean> {
  const result = await db.query<{ ok: boolean }>(sql);
  return result.rows[0]?.ok === true;
}

async function asRole<T>(
  role: "anon" | "authenticated" | "service_role",
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

async function addressCount(): Promise<number> {
  return asRole("authenticated", SITTER, async () => {
    const result = await db.query<{ parent_id: string; address: unknown }>(
      `select parent_id, address from public.booking_parent_service_addresses($1::uuid[])`,
      [[PARENT]]
    );
    const encoded = JSON.stringify(result.rows);
    assert.doesNotMatch(encoded, new RegExp(PHONE));
    assert.doesNotMatch(encoded, new RegExp(ID_NUMBER));
    assert.doesNotMatch(encoded, new RegExp(MEDICAL));
    assert.doesNotMatch(encoded, new RegExp(APARTMENT));
    return result.rows.length;
  });
}

async function main(): Promise<void> {
try {
  await assertParentProfilesSchemas();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
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
    grant usage on schema public to anon, authenticated, service_role;

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
      serial_id bigint,
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
    grant select on public.profiles to anon, authenticated, service_role;
    create role profiles_reader nologin noinherit;
    grant usage on schema public to profiles_reader;
    grant select on table public.profiles to profiles_reader;
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
    grant select on public.parent_profiles to anon, authenticated;

    insert into public.profiles (
      id, first_name, last_name, phone, address, identity_id_number,
      child_special_or_medical_details, children, avatar_url,
      identity_verification_status, parent_serial, public_id, serial_id, role
    ) values
      (
        '${PARENT}', 'Dana', 'Levi', '${PHONE}',
        '{"city":"Haifa","street":"Hans","houseNumber":"41","apartment":"${APARTMENT}","doorCode":"9988"}'::jsonb,
        '${ID_NUMBER}', '${MEDICAL}', '[{"name":"Noa"}]'::jsonb,
        'https://example.test/a.png', 'verified', 'RP-1001', 'RP-1001', 7, 'parent'
      ),
      (
        '${SITTER}', 'Maya', 'Cohen', '0500000000', null, null, null, null,
        null, 'unverified', null, null, 8, 'sitter'
      ),
      (
        '${STRANGER}', 'Ron', 'Bar', '0509999999', null, null, null, null,
        null, 'unverified', null, null, 9, 'parent'
      );

    insert into public.bookings (id, parent_id, sitter_id, status)
    values ('${BOOKING}', '${PARENT}', '${SITTER}', 'pending');

    insert into public.parent_profiles (id, address, children_ages)
    values ('${PARENT}', 'secret street 1', '4, 7');
  `);

  const leaked = await db.query<{ phone: string }>(
    `select phone from public.profiles where id = '${PARENT}'`
  );
  assert.equal(leaked.rows[0]?.phone, PHONE);

  await db.exec(migrationSql);

  assert.equal(
    await privilege(
      `select has_function_privilege('anon', 'public.booking_partner_display(uuid[])', 'EXECUTE') as ok`
    ),
    false
  );
  assert.equal(
    await privilege(
      `select has_function_privilege('public', 'public.booking_parent_service_addresses(uuid[])', 'EXECUTE') as ok`
    ),
    false
  );
  assert.equal(
    await privilege(
      `select has_function_privilege('authenticated', 'public.booking_partner_display(uuid[])', 'EXECUTE') as ok`
    ),
    true
  );
  assert.equal(
    await privilege(
      `select has_function_privilege('authenticated', 'public.booking_parent_service_addresses(uuid[])', 'EXECUTE') as ok`
    ),
    true
  );

  const definer = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(`
    select prosecdef, proconfig
    from pg_proc
    where proname = 'booking_partner_display'
  `);
  assert.equal(definer.rows[0]?.prosecdef, true);
  assert.ok(
    definer.rows[0]?.proconfig?.some((entry) => /^search_path=pg_catalog,\s*public$/.test(entry))
  );

  const addressDefiner = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(`
    select prosecdef, proconfig
    from pg_proc
    where proname = 'booking_parent_service_addresses'
  `);
  assert.equal(addressDefiner.rows[0]?.prosecdef, true);
  assert.ok(
    addressDefiner.rows[0]?.proconfig?.some((entry) => /^search_path=pg_catalog,\s*public$/.test(entry))
  );

  const owners = await db.query<{ same_owner: boolean }>(`
    select pg_get_userbyid(p.proowner) = pg_get_userbyid(c.relowner) as same_owner
    from pg_proc p
    join pg_namespace pn on pn.oid = p.pronamespace
    join pg_class c on c.relname = 'profiles'
    join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'public'
    where pn.nspname = 'public'
      and p.proname in ('booking_partner_display', 'booking_parent_service_addresses')
  `);
  assert.equal(owners.rows.length, 2);
  assert.ok(owners.rows.every((row) => row.same_owner));

  assert.equal(await privilege(`select has_table_privilege('anon', 'public.profiles', 'SELECT') as ok`), false);
  assert.equal(
    await privilege(`select has_table_privilege('authenticated', 'public.profiles', 'SELECT') as ok`),
    true
  );
  assert.equal(
    await privilege(`select has_table_privilege('service_role', 'public.profiles', 'SELECT') as ok`),
    true
  );
  assert.equal(
    await privilege(`select has_table_privilege('profiles_reader', 'public.profiles', 'SELECT') as ok`),
    false
  );
  assert.equal(
    await privilege(`select has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT') as ok`),
    false
  );
  assert.equal(
    await privilege(`
      select exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(c.relacl) a
        where n.nspname = 'public'
          and c.relname = 'profiles'
          and a.grantee = 0
          and a.privilege_type = 'SELECT'
      ) as ok
    `),
    false
  );

  const profilePolicies = await db.query<{ polname: string }>(`
    select pol.polname
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and pol.polcmd in ('r', '*')
      and pol.polpermissive
  `);
  const profilePolicyNames = profilePolicies.rows.map((row) => row.polname).sort();
  assert.deepEqual(profilePolicyNames, ["profiles_legacy_owner", "profiles_select_own"]);

  const legacyPolicies = await db.query<{ polname: string }>(`
    select pol.polname
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'parent_profiles'
      and pol.polpermissive
      and pol.polcmd in ('r', '*')
  `);
  assert.deepEqual(
    legacyPolicies.rows.map((row) => row.polname),
    ["parent_profiles_select_own"]
  );

  await assert.rejects(
    () => asRole("anon", null, () => db.query(`select phone from public.profiles`)),
    /permission denied/i
  );
  await assert.rejects(
    () => asRole("anon", null, () => db.query(`select address, children_ages from public.parent_profiles`)),
    /permission denied/i
  );

  const ownPhone = await asRole("authenticated", PARENT, () =>
    db.query<{ phone: string; medical: string }>(
      `select phone, child_special_or_medical_details as medical
       from public.profiles where id = '${PARENT}'`
    )
  );
  assert.equal(ownPhone.rows.length, 1);
  assert.equal(ownPhone.rows[0]?.phone, PHONE);
  assert.equal(ownPhone.rows[0]?.medical, MEDICAL);

  const hiddenPhone = await asRole("authenticated", SITTER, () =>
    db.query(`select phone, identity_id_number, child_special_or_medical_details from public.profiles where id = '${PARENT}'`)
  );
  assert.equal(hiddenPhone.rows.length, 0);

  const strangerRows = await asRole("authenticated", STRANGER, () =>
    db.query(`select id from public.profiles`)
  );
  assert.deepEqual(
    strangerRows.rows.map((row) => (row as { id: string }).id),
    [STRANGER]
  );

  const adminPhone = await asRole("service_role", null, () =>
    db.query<{ phone: string }>(`select phone from public.profiles where id = '${PARENT}'`)
  );
  assert.equal(adminPhone.rows[0]?.phone, PHONE);

  const ownLegacy = await asRole("authenticated", PARENT, () =>
    db.query<{ address: string }>(`select address from public.parent_profiles where id = '${PARENT}'`)
  );
  assert.equal(ownLegacy.rows[0]?.address, "secret street 1");
  const hiddenLegacy = await asRole("authenticated", SITTER, () =>
    db.query(`select address, children_ages from public.parent_profiles`)
  );
  assert.equal(hiddenLegacy.rows.length, 0);

  const pendingCard = await asRole("authenticated", SITTER, () =>
    db.query<Record<string, unknown>>(
      `select * from public.booking_partner_display($1::uuid[])`,
      [[PARENT]]
    )
  );
  assert.equal(pendingCard.rows.length, 1);
  assert.equal(pendingCard.rows[0]?.first_name, "Dana");
  const pendingEncoded = JSON.stringify(pendingCard.rows[0]);
  assert.doesNotMatch(pendingEncoded, /phone|identity_id_number|child_special|apartment|doorCode/);
  assert.doesNotMatch(pendingEncoded, new RegExp(PHONE));
  assert.doesNotMatch(pendingEncoded, new RegExp(ID_NUMBER));
  assert.doesNotMatch(pendingEncoded, new RegExp(MEDICAL));
  assert.equal(pendingCard.rows[0]?.identity_verified, true);
  assert.equal(pendingCard.rows[0]?.parent_serial, "RP-1001");
  assert.equal(await addressCount(), 0);

  const strangerCard = await asRole("authenticated", STRANGER, () =>
    db.query(`select id from public.booking_partner_display($1::uuid[])`, [[PARENT]])
  );
  assert.equal(strangerCard.rows.length, 0);
  const strangerAddress = await asRole("authenticated", STRANGER, () =>
    db.query(`select parent_id from public.booking_parent_service_addresses($1::uuid[])`, [[PARENT]])
  );
  assert.equal(strangerAddress.rows.length, 0);

  for (const status of ADDRESS_DENIED) {
    await db.exec(`update public.bookings set status = '${status}', cancelled_at = null where id = '${BOOKING}'`);
    assert.equal(await addressCount(), 0, `address leaked for status ${status}`);
  }

  for (const status of ADDRESS_ALLOWED) {
    await db.exec(`update public.bookings set status = '${status}', cancelled_at = null where id = '${BOOKING}'`);
    assert.equal(await addressCount(), 1, `address missing for status ${status}`);
    const row = await asRole("authenticated", SITTER, () =>
      db.query<{ address: { city?: string; street?: string; houseNumber?: string; apartment?: string } }>(
        `select address from public.booking_parent_service_addresses($1::uuid[])`,
        [[PARENT]]
      )
    );
    assert.equal(row.rows[0]?.address.city, "Haifa");
    assert.equal(row.rows[0]?.address.street, "Hans");
    assert.equal(row.rows[0]?.address.houseNumber, "41");
    assert.equal(row.rows[0]?.address.apartment, undefined);
  }

  await db.exec(
    `update public.bookings set status = 'approved', cancelled_at = now() where id = '${BOOKING}'`
  );
  assert.equal(await addressCount(), 0);

  const nameAfterEnd = await asRole("authenticated", SITTER, () =>
    db.query<{ first_name: string }>(
      `select first_name from public.booking_partner_display($1::uuid[])`,
      [[PARENT]]
    )
  );
  assert.equal(nameAfterEnd.rows[0]?.first_name, "Dana");

  const updated = await asRole("authenticated", PARENT, () =>
    db.query(
      `update public.profiles set first_name = 'Dana Updated' where id = '${PARENT}' returning first_name`
    )
  );
  assert.equal((updated.rows[0] as { first_name: string }).first_name, "Dana Updated");

  const crossUpdate = await asRole("authenticated", SITTER, () =>
    db.query(`update public.profiles set phone = '0500000001' where id = '${PARENT}' returning id`)
  );
  assert.equal(crossUpdate.rows.length, 0);

  await db.exec(rollbackSql);

  const restored = await asRole("anon", null, () =>
    db.query<{ phone: string }>(`select phone from public.profiles where id = '${PARENT}'`)
  );
  assert.equal(restored.rows[0]?.phone, PHONE);
  const functionsLeft = await db.query(
    `select proname from pg_proc where proname in ('booking_partner_display', 'booking_parent_service_addresses')`
  );
  assert.equal(functionsLeft.rows.length, 0);
  const ownPolicy = await db.query(
    `select polname from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
     where c.relname = 'profiles' and pol.polname = 'profiles_select_own'`
  );
  assert.equal(ownPolicy.rows.length, 1);
  console.log("profiles private select: authorized and unauthorized access checks passed");
} finally {
  await db.close();
}
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
