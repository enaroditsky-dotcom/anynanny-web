import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260823150000_delete_current_user_execute_grants.sql";
const sql = read(MIGRATION);
const sqlWithoutComments = sql.replace(/--[^\n]*/g, "");

assert.match(sql, /revoke all on function public\.delete_current_user\(\) from public;/);
assert.match(sql, /revoke all on function public\.delete_current_user\(\) from anon;/);
assert.match(sql, /grant execute on function public\.delete_current_user\(\) to authenticated;/);

assert.doesNotMatch(sqlWithoutComments, /revoke\s+.+\s+from\s+service_role/i);
assert.doesNotMatch(sqlWithoutComments, /revoke\s+.+\s+from\s+postgres/i);
assert.doesNotMatch(sqlWithoutComments, /grant\s+.+\s+to\s+service_role/i);
assert.doesNotMatch(sqlWithoutComments, /grant\s+.+\s+to\s+postgres/i);

assert.doesNotMatch(sql, /create or replace function/i);
assert.doesNotMatch(sql, /create function/i);
assert.doesNotMatch(sql, /drop function/i);
assert.doesNotMatch(sql, /delete from auth\.users/i);
assert.doesNotMatch(sql, /alter function/i);

assert.doesNotMatch(sql, /expire_pending_bookings/);
assert.doesNotMatch(sql, /notify_pending_no_response_reminders/);
assert.doesNotMatch(sql, /run_pending_booking_lifecycle_job/);
assert.doesNotMatch(sql, /bookings_block_expired_pending_approval/);
assert.doesNotMatch(sql, /cron\.schedule/);
assert.doesNotMatch(sql, /create trigger/i);
assert.doesNotMatch(sql, /drop trigger/i);
assert.doesNotMatch(sql, /alter table/i);

const client = read("lib/account/delete-current-user.ts");
assert.match(client, /supabase\.rpc\("delete_current_user"\)/);
assert.doesNotMatch(client, /rpc\("delete_current_user",/);

console.log("delete_current_user EXECUTE grant hardening checks passed.");
