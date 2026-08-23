import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260823140000_parent_wallet_billing_grant_hardening.sql";
const sql = read(MIGRATION);

const TABLES = ["parent_wallet_balances", "billing_transactions"] as const;

function tableGrantBlock(table: string): string {
  const start = sql.indexOf(`revoke all on table public.${table} from public;`);
  assert.ok(start >= 0, `${table} must revoke PUBLIC first`);
  const nextTable = TABLES.find(
    (name) => name !== table && sql.indexOf(`revoke all on table public.${name} from public;`) > start
  );
  const end = nextTable
    ? sql.indexOf(`revoke all on table public.${nextTable} from public;`)
    : sql.indexOf("drop policy if exists parent_wallet_balances_upsert_own");
  assert.ok(end > start, `${table} grant block must be bounded`);
  return sql.slice(start, end);
}

for (const table of TABLES) {
  const block = tableGrantBlock(table);
  assert.match(block, new RegExp(`revoke all on table public\\.${table} from public;`));
  assert.match(block, new RegExp(`revoke all on table public\\.${table} from anon;`));
  assert.match(block, new RegExp(`revoke all on table public\\.${table} from authenticated;`));
  assert.match(block, new RegExp(`grant select on table public\\.${table} to authenticated;`));
  assert.doesNotMatch(block, /grant insert/i);
  assert.doesNotMatch(block, /grant update/i);
  assert.doesNotMatch(block, /grant delete/i);
  assert.doesNotMatch(block, /grant all/i);
  assert.doesNotMatch(block, /grant select, insert/i);
}

assert.match(
  sql,
  /drop policy if exists parent_wallet_balances_upsert_own\s+on public\.parent_wallet_balances;/
);

const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");
assert.doesNotMatch(sqlWithoutComments, /service_role/);
assert.doesNotMatch(sqlWithoutComments, /^\s*revoke\s+.+\s+from\s+service_role/im);
assert.doesNotMatch(sqlWithoutComments, /^\s*grant\s+.+\s+to\s+service_role/im);

assert.doesNotMatch(sql, /drop policy if exists parent_wallet_balances_select_own/i);
assert.doesNotMatch(sql, /drop policy if exists billing_transactions_select_own/i);
assert.doesNotMatch(sql, /create policy/i);
assert.doesNotMatch(sql, /enable row level security/i);
assert.doesNotMatch(sql, /alter table/i);
assert.doesNotMatch(sql, /create or replace function/i);
assert.doesNotMatch(sql, /create trigger/i);
assert.doesNotMatch(sql, /drop trigger/i);
assert.doesNotMatch(sql, /expire_pending_bookings/);
assert.doesNotMatch(sql, /notify_pending_no_response_reminders/);
assert.doesNotMatch(sql, /run_pending_booking_lifecycle_job/);
assert.doesNotMatch(sql, /bookings_block_expired_pending_approval/);
assert.doesNotMatch(sql, /cron\.schedule/);
assert.doesNotMatch(sql, /finalize_verified_hyp_payment/);
assert.doesNotMatch(sql, /credit_sitter_wallet/);

console.log("F9/F10 parent wallet / billing grant hardening checks passed.");
