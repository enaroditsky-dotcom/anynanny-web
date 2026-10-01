import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { conversationMatchesInboxQuery } from "../lib/chat/inbox-search";
import { pickProfilePublicId } from "../lib/public/sequential-display-id";
import {
  defaultParentSearchFilters,
  isExactSitterSerialQuery,
  normalizeSitterSerialForLookup,
  toListPublicSittersSearchRpcArgs
} from "../lib/sitter/parent-search-filters";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  root,
  "supabase/migrations/20260930190000_real_user_public_ids.sql"
);
const singleTriggerPath = resolve(
  root,
  "supabase/migrations/20261001100000_single_sitter_public_id_trigger.sql"
);
const ensureSitterRowPath = resolve(
  root,
  "supabase/migrations/20261001103000_ensure_sitter_profile_row.sql"
);
const canonicalSitterPath = resolve(
  root,
  "supabase/migrations/20261001110000_profiles_canonical_sitter_public_id.sql"
);
const assignWithoutShellPath = resolve(
  root,
  "supabase/migrations/20261001121000_assign_nanny_public_id_without_shell_column.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const singleTriggerMigration = readFileSync(singleTriggerPath, "utf8");
const ensureSitterRowMigration = readFileSync(ensureSitterRowPath, "utf8");
const canonicalSitterMigration = readFileSync(canonicalSitterPath, "utf8");
const assignWithoutShellMigration = readFileSync(assignWithoutShellPath, "utf8");
const liveChecksSql = "-- Database checks owned by scripts/test-real-public-ids.ts.\r\n-- Refuses to run unless that test opted in, so the statements cannot burn\r\n-- production sequence values by accident.\r\n\r\ndo $chk$\r\nbegin\r\n  if current_setting('anynanny.real_public_id_test', true) is distinct from 'on' then\r\n    raise exception 'refusing to run outside the scratch real-public-id test';\r\n  end if;\r\nend $chk$;\r\n\r\ndo $chk$\r\ndeclare\r\n  v_parent_1 uuid := gen_random_uuid();\r\n  v_parent_2 uuid := gen_random_uuid();\r\n  v_sitter_1 uuid := gen_random_uuid();\r\n  v_sitter_2 uuid := gen_random_uuid();\r\n  v_later uuid := gen_random_uuid();\r\n  v_promoted uuid := gen_random_uuid();\r\n  v_legacy_parent uuid := gen_random_uuid();\r\n  v_legacy_an uuid := gen_random_uuid();\r\n  v_legacy_cons uuid := gen_random_uuid();\r\n  v_id text;\r\n  v_mirror text;\r\n  v_profile text;\r\n  v_last bigint;\r\n  v_called boolean;\r\n  v_rows int;\r\nbegin\r\n  insert into public.profiles (id, role, parent_serial)\r\n  values (v_parent_1, 'parent', 'RP-9999')\r\n  returning parent_serial, public_id into v_id, v_mirror;\r\n  if v_id is distinct from 'RP-1001' or v_mirror is distinct from 'RP-1001' then\r\n    raise exception 'first parent id is % / %', v_id, v_mirror;\r\n  end if;\r\n  if exists (select 1 from public.sitter_profiles where id = v_parent_1) then\r\n    raise exception 'parent profile insert created a sitter row';\r\n  end if;\r\n\r\n  insert into public.profiles (id, role)\r\n  values (v_parent_2, 'parent')\r\n  returning parent_serial into v_id;\r\n  if v_id is distinct from 'RP-1002' then\r\n    raise exception 'second parent id is %', v_id;\r\n  end if;\r\n\r\n  perform set_config('request.jwt.claim.sub', v_parent_1::text, true);\r\n  if public.ensure_sitter_nanny_serial() is not null then\r\n    raise exception 'parent ensure_sitter_nanny_serial returned an id';\r\n  end if;\r\n  if (select is_called from public.real_sitter_public_id_seq) then\r\n    raise exception 'parent ensure_sitter_nanny_serial consumed the sitter sequence';\r\n  end if;\r\n\r\n  select last_value into v_last from public.real_parent_public_id_seq;\r\n  update public.profiles\r\n     set parent_serial = 'RP-1002',\r\n         public_id = 'P-1001',\r\n         updated_at = now()\r\n   where id = v_parent_1;\r\n  select parent_serial, public_id into v_id, v_mirror from public.profiles where id = v_parent_1;\r\n  if v_id is distinct from 'RP-1001' or v_mirror is distinct from 'RP-1001' then\r\n    raise exception 'retry changed parent id to % / %', v_id, v_mirror;\r\n  end if;\r\n  if (select last_value from public.real_parent_public_id_seq) is distinct from v_last then\r\n    raise exception 'parent retry consumed another sequence value';\r\n  end if;\r\n\r\n  insert into public.profiles (id, role, nanny_serial)\r\n  values (v_sitter_1, 'sitter', 'AN-9999')\r\n  returning nanny_serial into v_profile;\r\n  select nanny_serial, nanny_id_number into v_id, v_mirror\r\n  from public.sitter_profiles where id = v_sitter_1;\r\n  if v_profile is distinct from 'RAN-1001' or v_id is distinct from 'RAN-1001' or v_mirror is distinct from 'RAN-1001' then\r\n    raise exception 'first sitter id is profile % row % / %', v_profile, v_id, v_mirror;\r\n  end if;\r\n  select last_value, is_called into v_last, v_called from public.real_sitter_public_id_seq;\r\n  if v_last is distinct from 1001 or v_called is distinct from true then\r\n    raise exception 'first sitter consumed more than one sequence value: last=% called=%', v_last, v_called;\r\n  end if;\r\n\r\n  update public.profiles\r\n     set role = 'sitter',\r\n         nanny_serial = 'RAN-9999',\r\n         updated_at = now()\r\n   where id = v_sitter_1;\r\n  select nanny_serial into v_profile from public.profiles where id = v_sitter_1;\r\n  select nanny_serial into v_id from public.sitter_profiles where id = v_sitter_1;\r\n  if v_profile is distinct from 'RAN-1001' or v_id is distinct from 'RAN-1001' then\r\n    raise exception 'repeated profile update changed sitter id to % / %', v_profile, v_id;\r\n  end if;\r\n  if (select last_value from public.real_sitter_public_id_seq) is distinct from 1001 then\r\n    raise exception 'repeated profile update consumed a sitter sequence value';\r\n  end if;\r\n  select count(*)::int into v_rows from public.sitter_profiles where id = v_sitter_1;\r\n  if v_rows is distinct from 1 then\r\n    raise exception 'repeated profile update duplicated the sitter row';\r\n  end if;\r\n\r\n  insert into public.profiles (id, role)\r\n  values (v_sitter_2, 'sitter')\r\n  returning nanny_serial into v_profile;\r\n  select nanny_serial into v_id from public.sitter_profiles where id = v_sitter_2;\r\n  if v_profile is distinct from 'RAN-1002' or v_id is distinct from 'RAN-1002' then\r\n    raise exception 'second sitter id is % / %', v_profile, v_id;\r\n  end if;\r\n  if (select last_value from public.real_sitter_public_id_seq) is distinct from 1002 then\r\n    raise exception 'second sitter did not consume exactly one sequence value';\r\n  end if;\r\n\r\n  alter table public.profiles disable trigger profiles_ensure_sitter_profile;\r\n  insert into public.profiles (id, role, nanny_serial)\r\n  values (v_later, 'sitter', 'RAN-9999')\r\n  returning nanny_serial into v_profile;\r\n  if v_profile is distinct from 'RAN-1003' then\r\n    raise exception 'sitter without a detail row got %', v_profile;\r\n  end if;\r\n  if exists (select 1 from public.sitter_profiles where id = v_later) then\r\n    raise exception 'missing sitter_profiles row was created anyway';\r\n  end if;\r\n  select last_value into v_last from public.real_sitter_public_id_seq;\r\n  alter table public.profiles enable trigger profiles_ensure_sitter_profile;\r\n  insert into public.sitter_profiles (id, nanny_serial, service_types)\r\n  values (v_later, 'AN-9999', array['babysitter']::text[])\r\n  returning nanny_serial, nanny_id_number into v_id, v_mirror;\r\n  if v_id is distinct from 'RAN-1003' or v_mirror is distinct from 'RAN-1003' then\r\n    raise exception 'later sitter row allocated % / %', v_id, v_mirror;\r\n  end if;\r\n  if (select last_value from public.real_sitter_public_id_seq) is distinct from v_last then\r\n    raise exception 'creating sitter_profiles later consumed another sequence value';\r\n  end if;\r\n\r\n  alter table public.profiles disable trigger profiles_assign_parent_public_id;\r\n  insert into public.profiles (id, role) values (v_promoted, 'parent');\r\n  alter table public.profiles enable trigger profiles_assign_parent_public_id;\r\n  if exists (select 1 from public.sitter_profiles where id = v_promoted) then\r\n    raise exception 'parent profile insert created a sitter row';\r\n  end if;\r\n  update public.profiles set role = 'sitter' where id = v_promoted;\r\n  select p.nanny_serial, sp.nanny_serial\r\n    into v_profile, v_id\r\n  from public.profiles p\r\n  join public.sitter_profiles sp on sp.id = p.id\r\n  where p.id = v_promoted;\r\n  if v_profile is distinct from 'RAN-1004' or v_id is distinct from 'RAN-1004' then\r\n    raise exception 'parent to sitter role change got % / %', v_profile, v_id;\r\n  end if;\r\n\r\n  alter table public.profiles disable trigger profiles_assign_nanny_public_id;\r\n  insert into public.profiles (id, role, nanny_serial)\r\n  values (v_legacy_an, 'sitter', 'AN-1004');\r\n  alter table public.profiles enable trigger profiles_assign_nanny_public_id;\r\n  update public.profiles\r\n     set nanny_serial = 'RAN-9999',\r\n         role = 'sitter',\r\n         updated_at = now()\r\n   where id = v_legacy_an;\r\n  update public.sitter_profiles\r\n     set service_types = array['lactation_consultant']::text[],\r\n         nanny_serial = 'RAN-9999'\r\n   where id = v_legacy_an;\r\n  select p.nanny_serial, sp.nanny_serial\r\n    into v_profile, v_id\r\n  from public.profiles p\r\n  join public.sitter_profiles sp on sp.id = p.id\r\n  where p.id = v_legacy_an;\r\n  if v_profile is distinct from 'AN-1004' or v_id is distinct from 'AN-1004' then\r\n    raise exception 'existing AN id changed to % / %', v_profile, v_id;\r\n  end if;\r\n\r\n  alter table public.profiles disable trigger profiles_assign_nanny_public_id;\r\n  insert into public.profiles (id, role, nanny_serial)\r\n  values (v_legacy_cons, 'sitter', 'CONS-1001');\r\n  alter table public.profiles enable trigger profiles_assign_nanny_public_id;\r\n  update public.profiles set role = 'sitter', nanny_serial = 'RAN-1001' where id = v_legacy_cons;\r\n  update public.sitter_profiles\r\n     set service_types = array['babysitter']::text[],\r\n         nanny_serial = 'AN-1001'\r\n   where id = v_legacy_cons;\r\n  select p.nanny_serial, sp.nanny_serial, sp.nanny_id_number\r\n    into v_profile, v_id, v_mirror\r\n  from public.profiles p\r\n  join public.sitter_profiles sp on sp.id = p.id\r\n  where p.id = v_legacy_cons;\r\n  if v_profile is distinct from 'CONS-1001' or v_id is distinct from 'CONS-1001' or v_mirror is distinct from 'CONS-1001' then\r\n    raise exception 'existing CONS id changed to % / % / %', v_profile, v_id, v_mirror;\r\n  end if;\r\n\r\n  select last_value into v_last from public.real_sitter_public_id_seq;\r\n  update public.sitter_profiles\r\n     set service_types = array['lactation_consultant', 'doula']::text[]\r\n   where id = v_sitter_1;\r\n  select nanny_serial into v_id from public.sitter_profiles where id = v_sitter_1;\r\n  select nanny_serial into v_profile from public.profiles where id = v_sitter_1;\r\n  if v_id is distinct from 'RAN-1001' or v_profile is distinct from 'RAN-1001' then\r\n    raise exception 'service change rewrote RAN to % / %', v_id, v_profile;\r\n  end if;\r\n  if (select last_value from public.real_sitter_public_id_seq) is distinct from v_last then\r\n    raise exception 'service change consumed a sitter sequence value';\r\n  end if;\r\n\r\n  select last_value into v_last from public.real_sitter_public_id_seq;\r\n  perform set_config('request.jwt.claim.sub', v_sitter_1::text, true);\r\n  if public.ensure_sitter_nanny_serial() is distinct from 'RAN-1001' then\r\n    raise exception 'ensure_sitter_nanny_serial changed the first sitter';\r\n  end if;\r\n  if (select last_value from public.real_sitter_public_id_seq) is distinct from v_last then\r\n    raise exception 'ensure_sitter consumed a sequence value';\r\n  end if;\r\n\r\n  alter table public.profiles disable trigger profiles_assign_parent_public_id;\r\n  insert into public.profiles (id, role, parent_serial, public_id, \"anyNannyId\", nanny_serial)\r\n  values (v_legacy_parent, 'parent', 'P-1004', 'P-1004', 'ANN-LEGACY', 'AN-LEGACY');\r\n  alter table public.profiles enable trigger profiles_assign_parent_public_id;\r\n  update public.profiles\r\n     set parent_serial = 'RP-1001',\r\n         public_id = 'RP-1001'\r\n   where id = v_legacy_parent;\r\n  select parent_serial, public_id, nanny_serial into v_id, v_mirror, v_profile\r\n  from public.profiles where id = v_legacy_parent;\r\n  if v_id is distinct from 'P-1004' or v_mirror is distinct from 'P-1004' or v_profile is distinct from 'AN-LEGACY' then\r\n    raise exception 'legacy parent fields changed to % / % / %', v_id, v_mirror, v_profile;\r\n  end if;\r\n\r\n  if (select is_called from public.nanny_serial_seq) then\r\n    raise exception 'new sitter path consumed nanny_serial_seq';\r\n  end if;\r\n  if exists (\r\n    select 1\r\n    from pg_trigger t\r\n    join pg_class c on c.oid = t.tgrelid\r\n    join pg_namespace n on n.oid = c.relnamespace\r\n    where n.nspname = 'public'\r\n      and c.relname = 'profiles'\r\n      and not t.tgisinternal\r\n      and t.tgname in (\r\n        'set_sitter_serial_trg',\r\n        'set_sitter_serial_trigger',\r\n        'trigger_assign_nanny_id',\r\n        'profiles_assign_nanny_serial'\r\n      )\r\n  ) then\r\n    raise exception 'a legacy profiles sitter-id trigger is still attached';\r\n  end if;\r\nend $chk$;\r\n";
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(
  pickProfilePublicId({ parent_serial: "RP-1001", serial_id: 1 }, "parent"),
  "RP-1001"
);
assert.equal(
  pickProfilePublicId({ parent_serial: "P-1004", serial_id: 4 }, "parent"),
  "P-1004"
);
assert.equal(pickProfilePublicId({ public_id: "rp-1002" }, "parent"), "RP-1002");
assert.equal(
  pickProfilePublicId({ nanny_serial: "RAN-1001", serial_id: 1 }, "sitter"),
  "RAN-1001"
);
assert.equal(pickProfilePublicId({ nanny_serial: "AN-1004" }, "sitter"), "AN-1004");
assert.equal(pickProfilePublicId({ nanny_serial: "CONS-1001" }, "sitter"), "CONS-1001");
assert.equal(pickProfilePublicId({ nanny_id_number: "ran_1003" }, "sitter"), "RAN-1003");

assert.equal(normalizeSitterSerialForLookup("ran-1001"), "RAN-1001");
assert.equal(normalizeSitterSerialForLookup("RAN_1002"), "RAN-1002");
assert.equal(normalizeSitterSerialForLookup("AN-1004"), "AN-1004");
assert.equal(normalizeSitterSerialForLookup("CONS-1001"), "CONS-1001");
assert.equal(normalizeSitterSerialForLookup("1004"), "AN-1004");
assert.equal(isExactSitterSerialQuery("RAN-1001"), true);
assert.equal(isExactSitterSerialQuery("an-1004"), true);
assert.equal(isExactSitterSerialQuery("cons-1001"), true);
assert.equal(isExactSitterSerialQuery("RP-1001"), false);

const serialSearch = toListPublicSittersSearchRpcArgs({
  ...defaultParentSearchFilters(),
  searchSitterSerial: "ran-1001",
  minRating: "4",
  minYearsExperience: 3,
  transport: "self"
});
assert.equal(serialSearch.p_search_nanny_id, "RAN-1001");
assert.equal(serialSearch.p_min_rating, null);
assert.equal(serialSearch.p_min_years_experience, 0);
assert.equal(serialSearch.p_transport, "all");

const legacySerialSearch = toListPublicSittersSearchRpcArgs({
  ...defaultParentSearchFilters(),
  searchSitterSerial: "AN-1004"
});
assert.equal(legacySerialSearch.p_search_nanny_id, "AN-1004");

assert.equal(
  conversationMatchesInboxQuery({ partner_public_id: "RP-1001", partner_name: "הורה" }, "rp-1001"),
  true
);
assert.equal(
  conversationMatchesInboxQuery({ partner_public_id: "RAN-1002", partner_name: "נני" }, "RAN-1002"),
  true
);
assert.equal(
  conversationMatchesInboxQuery({ partner_public_id: "AN-1004", partner_name: "נני" }, "1004"),
  true
);

assert.match(migration, /create sequence if not exists public\.real_parent_public_id_seq/);
assert.match(migration, /create sequence if not exists public\.real_sitter_public_id_seq/);
assert.match(migration, /start with 1001/);
assert.match(migration, /nextval\('public\.real_parent_public_id_seq'\)/);
assert.match(migration, /nextval\('public\.real_sitter_public_id_seq'\)/);
assert.match(migration, /'RP-' \|\| nextval/);
assert.match(migration, /'RAN-' \|\| nextval/);
assert.doesNotMatch(migration, /max\s*\(/i);
assert.doesNotMatch(migration, /count\s*\(/i);
assert.doesNotMatch(migration, /create trigger sitter_profiles_assign_nanny_serial_ins/);
assert.match(migration, /drop trigger if exists sitter_profiles_assign_nanny_serial_ins/);
assert.match(migration, /revoke all on sequence public\.real_parent_public_id_seq from anon/);
assert.match(migration, /revoke all on sequence public\.real_sitter_public_id_seq from authenticated/);
assert.match(migration, /v_role is distinct from 'sitter'/);
assert.match(migration, /old\.parent_serial/);
assert.match(migration, /old\.nanny_serial/);
assert.doesNotMatch(migration, /(?<![A-Za-z0-9_])parent_public_id\b/);
assert.doesNotMatch(migration, /add column/i);
assert.match(migration, /Canonical public id is permanent/);
assert.doesNotMatch(migration, /\(AN\|RAN\)/);
assert.doesNotMatch(migration, /return public\.generate_consultant_serial/);
assert.doesNotMatch(migration, /set parent_serial = public\.generate_parent_public_id/);
assert.doesNotMatch(migration, /set nanny_serial = public\.generate_nanny_serial/);

assert.match(singleTriggerMigration, /'RAN-' \|\| nextval\('public\.real_sitter_public_id_seq'\)/);
assert.match(singleTriggerMigration, /drop trigger if exists set_sitter_serial_trg on public\.sitter_profiles/);
assert.match(singleTriggerMigration, /drop trigger if exists set_sitter_serial_trigger on public\.sitter_profiles/);
assert.match(singleTriggerMigration, /drop trigger if exists trigger_assign_nanny_id on public\.sitter_profiles/);
assert.match(singleTriggerMigration, /drop trigger if exists sitter_profiles_assign_nanny_serial_ins on public\.sitter_profiles/);
assert.match(
  singleTriggerMigration,
  /create trigger sitter_profiles_assign_nanny_serial\s+before insert or update of nanny_serial, nanny_id_number, service_types/
);
assert.match(singleTriggerMigration, /v_role is distinct from 'sitter'/);
assert.match(singleTriggerMigration, /revoke all on function public\.generate_nanny_serial\(\) from public/);
assert.match(singleTriggerMigration, /revoke all on sequence public\.real_sitter_public_id_seq from authenticated/);
assert.match(singleTriggerMigration, /grant execute on function public\.ensure_sitter_nanny_serial\(\) to authenticated/);
assert.doesNotMatch(singleTriggerMigration, /nanny_serial_seq/);
assert.doesNotMatch(singleTriggerMigration, /'AN-'/);
assert.doesNotMatch(singleTriggerMigration, /'CONS-'/);
assert.doesNotMatch(singleTriggerMigration, /consultant_serial_seq/);
assert.doesNotMatch(singleTriggerMigration, /drop function/i);
assert.doesNotMatch(singleTriggerMigration, /generate_parent_public_id/);
assert.doesNotMatch(singleTriggerMigration, /assign_parent_public_id/);
assert.doesNotMatch(singleTriggerMigration, /max\s*\(/i);
assert.doesNotMatch(singleTriggerMigration, /count\s*\(/i);

assert.match(ensureSitterRowMigration, /ensure_sitter_profile_from_profile/);
assert.match(
  ensureSitterRowMigration,
  /create trigger profiles_ensure_sitter_profile\s+after insert or update of role\s+on public\.profiles/
);
assert.match(ensureSitterRowMigration, /new\.role is distinct from 'sitter'/);
assert.match(ensureSitterRowMigration, /insert into public\.sitter_profiles \(id, updated_at\)/);
assert.match(ensureSitterRowMigration, /where not exists/);
assert.match(ensureSitterRowMigration, /when unique_violation then/);
assert.doesNotMatch(ensureSitterRowMigration, /generate_nanny_serial/);
assert.doesNotMatch(ensureSitterRowMigration, /nextval/);
assert.doesNotMatch(ensureSitterRowMigration, /nanny_serial_seq/);
assert.doesNotMatch(ensureSitterRowMigration, /'AN-'/);
assert.doesNotMatch(ensureSitterRowMigration, /'RAN-'/);
assert.doesNotMatch(ensureSitterRowMigration, /max\s*\(/i);
assert.doesNotMatch(ensureSitterRowMigration, /count\s*\(/i);

assert.equal((canonicalSitterMigration.match(/nextval\(/g) || []).length, 1);
assert.match(canonicalSitterMigration, /'RAN-' \|\| nextval\('public\.real_sitter_public_id_seq'\)/);
assert.match(canonicalSitterMigration, /create trigger profiles_assign_nanny_public_id\s+before insert or update\s+on public\.profiles/);
assert.match(canonicalSitterMigration, /execute function public\.assign_nanny_public_id\(\)/);
assert.match(canonicalSitterMigration, /drop trigger if exists set_sitter_serial_trigger on public\.profiles/);
assert.match(canonicalSitterMigration, /drop trigger if exists set_sitter_serial_trg on public\.profiles/);
assert.match(canonicalSitterMigration, /drop trigger if exists trigger_assign_nanny_id on public\.profiles/);
assert.match(canonicalSitterMigration, /new\.nanny_serial := v_existing/);
assert.match(canonicalSitterMigration, /elsif new\.role = 'sitter'/);
assert.doesNotMatch(canonicalSitterMigration, /nanny_serial_seq/);
assert.doesNotMatch(canonicalSitterMigration, /'AN-' \|\|/);
const assignSitterFn = canonicalSitterMigration.slice(
  canonicalSitterMigration.indexOf("function public.assign_sitter_nanny_serial"),
  canonicalSitterMigration.indexOf("function public.ensure_sitter_nanny_serial")
);
const ensureSitterFn = canonicalSitterMigration.slice(
  canonicalSitterMigration.indexOf("function public.ensure_sitter_nanny_serial"),
  canonicalSitterMigration.indexOf("drop trigger if exists set_sitter_serial_trg on public.sitter_profiles")
);
assert.doesNotMatch(assignSitterFn, /nextval\(/);
assert.doesNotMatch(assignSitterFn, /generate_nanny_serial\(/);
assert.doesNotMatch(ensureSitterFn, /nextval\(/);
assert.doesNotMatch(ensureSitterFn, /generate_nanny_serial\(/);
assert.doesNotMatch(canonicalSitterMigration, /max\s*\(/i);
assert.doesNotMatch(canonicalSitterMigration, /count\s*\(/i);

const assignWithoutShellBody = assignWithoutShellMigration.replaceAll(
  "assign_nanny_public_id",
  ""
);
assert.match(
  assignWithoutShellMigration,
  /create or replace function public\.assign_nanny_public_id\(\)/
);
assert.match(assignWithoutShellMigration, /elsif new\.role = 'sitter'/);
assert.match(assignWithoutShellMigration, /new\.nanny_serial := v_existing/);
assert.match(assignWithoutShellMigration, /new\.nanny_serial := public\.generate_nanny_serial\(\)/);
assert.doesNotMatch(assignWithoutShellBody, /nanny_public_id/);
assert.doesNotMatch(assignWithoutShellMigration, /generate_nanny_public_id/);
assert.doesNotMatch(assignWithoutShellMigration, /nextval\(/);
assert.doesNotMatch(assignWithoutShellMigration, /drop function/i);
assert.doesNotMatch(assignWithoutShellMigration, /generate_parent_public_id/);
assert.doesNotMatch(assignWithoutShellMigration, /assign_sitter_nanny_serial/);
assert.doesNotMatch(assignWithoutShellMigration, /ensure_sitter_profile_from_profile/);
assert.doesNotMatch(assignWithoutShellMigration, /real_sitter_public_id_seq/);

const latestSearch = read(
  "supabase/migrations/20260917013000_public_sitter_identity_verified_badge.sql"
);
assert.match(
  latestSearch,
  /else upper\(regexp_replace\(trim\(p_search_nanny_id\), '\\s\+', '', 'g'\)\)/
);
assert.match(read("lib/chat/booking-messages.ts"), /parent_serial, public_id, serial_id/);
assert.doesNotMatch(read("lib/public/sequential-display-id.ts"), /(?<![A-Za-z0-9_])parent_public_id\b/);
assert.doesNotMatch(read("lib/supabase/profiles.ts"), /(?<![A-Za-z0-9_])parent_public_id\b/);

const container = "anynanny-real-id-pg";
const setupSql = `
create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.profiles (
  id uuid primary key,
  role text,
  serial_id integer,
  public_id text,
  "anyNannyId" text,
  nanny_serial text,
  parent_serial text,
  updated_at timestamptz
);

create unique index profiles_parent_serial_key
  on public.profiles (parent_serial)
  where parent_serial is not null;

create table public.sitter_profiles (
  id uuid primary key,
  nanny_serial text,
  nanny_id_number text,
  service_types text[],
  updated_at timestamptz
);

create unique index sitter_profiles_nanny_serial_key
  on public.sitter_profiles (nanny_serial)
  where nanny_serial is not null;

create or replace function public.generate_nanny_public_id()
returns text
language sql
volatile
as $$
  select 'Nanny-0001';
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

create sequence if not exists public.consultant_serial_seq
  start with 1001
  increment by 1;

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
      where upper(trim(coalesce(sp.nanny_serial, ''))) = upper(v_candidate)
    );
  end loop;
  return v_candidate;
end;
$$;

create sequence if not exists public.nanny_serial_seq
  start with 1001
  increment by 1;

create or replace function public.legacy_assign_an_serial()
returns trigger
language plpgsql
as $$
begin
  new.nanny_serial := 'AN-' || nextval('public.nanny_serial_seq')::text;
  new.nanny_id_number := new.nanny_serial;
  return new;
end;
$$;

create trigger set_sitter_serial_trg
  before insert or update on public.sitter_profiles
  for each row
  execute function public.legacy_assign_an_serial();

create trigger set_sitter_serial_trigger
  before insert or update on public.sitter_profiles
  for each row
  execute function public.legacy_assign_an_serial();

create trigger trigger_assign_nanny_id
  before insert or update on public.sitter_profiles
  for each row
  execute function public.legacy_assign_an_serial();

create trigger sitter_profiles_assign_nanny_serial_ins
  before insert on public.sitter_profiles
  for each row
  execute function public.legacy_assign_an_serial();

create or replace function public.legacy_assign_profile_an()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'sitter' then
    new.nanny_serial := 'AN-' || nextval('public.nanny_serial_seq')::text;
  end if;
  return new;
end;
$$;

create trigger set_sitter_serial_trigger
  before insert or update on public.profiles
  for each row
  execute function public.legacy_assign_profile_an();
`;

const shellColumnProofSql = `
do $chk$
declare
  v_def text := pg_get_functiondef('public.assign_nanny_public_id()'::regprocedure);
  v_body text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'nanny_public_id'
  ) then
    raise exception 'scratch profiles has nanny_public_id; this test requires the production shape';
  end if;

  if to_regprocedure('public.generate_nanny_public_id()') is null then
    raise exception 'legacy shell generator was dropped';
  end if;

  v_body := replace(v_def, 'assign_nanny_public_id', '');
  if position('nanny_public_id' in v_body) > 0
     or position('generate_nanny_public_id' in v_def) > 0 then
    raise exception 'canonical sitter assignment still references the missing shell column';
  end if;
end $chk$;
`;

const singleTriggerProofSql = `
do $chk$
declare
  v_legacy uuid := '99999999-9999-4999-8999-999999999997';
  v_id text;
  v_mirror text;
  v_triggers int;
  v_src text;
  v_called boolean;
begin
  select is_called into v_called from public.nanny_serial_seq;
  if v_called then
    raise exception 'new sitter inserts consumed nanny_serial_seq';
  end if;

  select count(*)::int into v_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'sitter_profiles'
    and not t.tgisinternal;
  if v_triggers is distinct from 1 then
    raise exception 'expected one sitter public-id trigger, found %', v_triggers;
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'sitter_profiles'
      and not t.tgisinternal
      and t.tgname = 'sitter_profiles_assign_nanny_serial'
  ) then
    raise exception 'canonical sitter trigger is missing';
  end if;

  select pg_get_functiondef('public.generate_nanny_serial()'::regprocedure) into v_src;
  if position('real_sitter_public_id_seq' in v_src) = 0
     or position('RAN-' in v_src) = 0
     or position('nanny_serial_seq' in v_src) > 0
     or position('AN-' in replace(v_src, 'RAN-', '')) > 0
     or position('CONS-' in v_src) > 0 then
    raise exception 'generate_nanny_serial is not the RAN sequence path';
  end if;

  alter table public.sitter_profiles disable trigger sitter_profiles_assign_nanny_serial;
  insert into public.sitter_profiles (id, nanny_serial, nanny_id_number, service_types)
  values (v_legacy, 'AN-1007', 'AN-1007', array['babysitter']::text[]);
  alter table public.sitter_profiles enable trigger sitter_profiles_assign_nanny_serial;

  update public.sitter_profiles
     set service_types = array['lactation_consultant']::text[],
         nanny_serial = 'RAN-9999',
         nanny_id_number = 'RAN-9999'
   where id = v_legacy;

  select nanny_serial, nanny_id_number into v_id, v_mirror
  from public.sitter_profiles
  where id = v_legacy;
  if v_id is distinct from 'AN-1007' or v_mirror is distinct from 'AN-1007' then
    raise exception 'AN-1007 was rewritten to % / %', v_id, v_mirror;
  end if;

  select is_called into v_called from public.nanny_serial_seq;
  if v_called then
    raise exception 'preserving AN-1007 consumed nanny_serial_seq';
  end if;
end
$chk$;
`;

function docker(args: string[], input?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("docker", args, { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`docker ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
    });
    child.stdin.end(input ?? "");
  });
}

async function psql(sql: string): Promise<string> {
  return docker(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], sql);
}

async function runEmbeddedPostgres(): Promise<boolean> {
  let EmbeddedPostgres: new (options: Record<string, unknown>) => {
    initialise: () => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
  };
  let postgres: (options: Record<string, unknown>) => {
    unsafe: (sql: string) => Promise<Array<Record<string, string>>>;
    end: () => Promise<void>;
  };
  try {
    const embeddedSpecifier = "embedded-postgres";
    const postgresSpecifier = "postgres";
    const embeddedModule = (await import(embeddedSpecifier)) as {
      default: typeof EmbeddedPostgres;
    };
    const postgresModule = (await import(postgresSpecifier)) as {
      default: typeof postgres;
    };
    EmbeddedPostgres = embeddedModule.default;
    postgres = postgresModule.default;
  } catch {
    return false;
  }

  const databaseDir = mkdtempSync(join(tmpdir(), "anynanny-real-id-"));
  const port = await new Promise<number>((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once("error", rejectPort);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const chosen = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(chosen));
    });
  });
  const embedded = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false
  });
  const connection = {
    host: "127.0.0.1",
    port,
    username: "postgres",
    password: "postgres",
    database: "postgres",
    max: 1
  };

  try {
    await embedded.initialise();
    await embedded.start();
    const sql = postgres(connection);
    try {
      await sql.unsafe(setupSql);
      await sql.unsafe(migration);
      await sql.unsafe(singleTriggerMigration);
      await sql.unsafe(ensureSitterRowMigration);
      await sql.unsafe(canonicalSitterMigration);
      await sql.unsafe(assignWithoutShellMigration);
      await sql.unsafe(shellColumnProofSql);
      await sql.unsafe(
        `select set_config('anynanny.real_public_id_test', 'on', false);\n${liveChecksSql}`
      );
      await sql.unsafe(singleTriggerProofSql);

      const beforeParents = Number(
        (await sql.unsafe("select last_value::text as value from public.real_parent_public_id_seq"))[0].value
      );
      const beforeSitters = Number(
        (await sql.unsafe("select last_value::text as value from public.real_sitter_public_id_seq"))[0].value
      );
      const left = postgres(connection);
      const right = postgres(connection);
      try {
        await Promise.all([
          left.unsafe("insert into public.profiles (id, role) values (gen_random_uuid(), 'parent')"),
          right.unsafe("insert into public.profiles (id, role) values (gen_random_uuid(), 'parent')")
        ]);
        await Promise.all([
          left.unsafe(
            "insert into public.profiles (id, role) values (gen_random_uuid(), 'sitter')"
          ),
          right.unsafe(
            "insert into public.profiles (id, role) values (gen_random_uuid(), 'sitter')"
          )
        ]);
      } finally {
        await left.end();
        await right.end();
      }

      const parents = await sql.unsafe(
        "select parent_serial from public.profiles where parent_serial like 'RP-%' order by parent_serial"
      );
      const sitters = await sql.unsafe(
        "select nanny_serial from public.sitter_profiles where nanny_serial like 'RAN-%' order by nanny_serial"
      );
      const parentIds = parents.map((row) => row.parent_serial);
      const sitterIds = sitters.map((row) => row.nanny_serial);
      assert.deepEqual(parentIds.filter((id) => Number(id.slice(3)) > beforeParents), [
        `RP-${beforeParents + 1}`,
        `RP-${beforeParents + 2}`
      ]);
      assert.deepEqual(sitterIds.filter((id) => Number(id.slice(4)) > beforeSitters), [
        `RAN-${beforeSitters + 1}`,
        `RAN-${beforeSitters + 2}`
      ]);
      assert.equal(new Set(parentIds).size, parentIds.length);
      assert.equal(new Set(sitterIds).size, sitterIds.length);
    } finally {
      await sql.end();
    }
    console.log("Live Postgres checks passed, including two-session concurrent inserts.");
    return true;
  } finally {
    await embedded.stop().catch(() => undefined);
    try {
      rmSync(databaseDir, { recursive: true, force: true });
    } catch {
      // Windows can keep the data directory locked briefly after the server exits.
    }
  }
}

async function runScratchDatabase(): Promise<void> {
  let dockerAvailable = true;
  try {
    await docker(["version", "--format", "{{.Server.Version}}"]);
  } catch {
    dockerAvailable = false;
  }
  if (!dockerAvailable) {
    const embedded = await runEmbeddedPostgres();
    if (!embedded) {
      console.log("SKIP live Postgres checks: Docker and embedded Postgres are not available.");
    }
    return;
  }

  await docker(["rm", "-f", container]).catch(() => undefined);
  await docker([
    "run",
    "-d",
    "--name",
    container,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16"
  ]);

  try {
    const readyDeadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      try {
        await psql("select 1");
        ready = true;
        break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
      }
    }
    if (!ready) throw new Error("scratch Postgres did not become ready");

    await psql(setupSql);
    await psql(migration);
    await psql(singleTriggerMigration);
    await psql(ensureSitterRowMigration);
    await psql(canonicalSitterMigration);
    await psql(assignWithoutShellMigration);
    await psql(shellColumnProofSql);
    await psql(`select set_config('anynanny.real_public_id_test', 'on', false);\n${liveChecksSql}`);
    await psql(singleTriggerProofSql);

    await Promise.all([
      psql("insert into public.profiles (id, role) values (gen_random_uuid(), 'parent');"),
      psql("insert into public.profiles (id, role) values (gen_random_uuid(), 'parent');")
    ]);
    await Promise.all([
      psql(
        "insert into public.profiles (id, role) values (gen_random_uuid(), 'sitter');"
      ),
      psql(
        "insert into public.profiles (id, role) values (gen_random_uuid(), 'sitter');"
      )
    ]);

    const parentIds = (await psql(
      "select parent_serial from public.profiles where parent_serial like 'RP-%' order by parent_serial;"
    ))
      .split(/\s+/)
      .filter((value) => /^RP-\d+$/.test(value));
    const sitterIds = (await psql(
      "select nanny_serial from public.sitter_profiles where nanny_serial like 'RAN-%' order by nanny_serial;"
    ))
      .split(/\s+/)
      .filter((value) => /^RAN-\d+$/.test(value));

    assert.deepEqual(parentIds, ["RP-1001", "RP-1002", "RP-1003", "RP-1004"]);
    assert.deepEqual(sitterIds, ["RAN-1001", "RAN-1002", "RAN-1003", "RAN-1004", "RAN-1005", "RAN-1006"]);
    assert.equal(new Set(parentIds).size, parentIds.length);
    assert.equal(new Set(sitterIds).size, sitterIds.length);
    console.log("Live Postgres checks passed, including concurrent inserts.");
  } finally {
    await docker(["rm", "-f", container]).catch(() => undefined);
  }
}

runScratchDatabase()
  .then(() => {
    console.log("real public id tests passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
