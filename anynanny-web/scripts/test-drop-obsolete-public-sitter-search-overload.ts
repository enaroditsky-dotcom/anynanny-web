import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const OVERLOAD = "supabase/migrations/20260823002000_drop_obsolete_public_sitter_search_overload.sql";
const AVATAR = "supabase/migrations/20260823001000_public_sitter_rpc_avatar_source.sql";
const sql = read(OVERLOAD);
const avatar = read(AVATAR);

const TWELVE_ARG_DROP =
  /drop function if exists public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text,\s*double precision,\s*double precision,\s*double precision\s*\)/;

assert.match(sql, TWELVE_ARG_DROP);
assert.doesNotMatch(sql, /create or replace function/i);
assert.doesNotMatch(sql, /expire_pending_bookings/);
assert.doesNotMatch(sql, /bookings_block_expired_pending_approval/);
assert.doesNotMatch(sql, /cron\.schedule/);
assert.doesNotMatch(sql, /sitter_profiles_select_public_authenticated/);

assert.match(
  sql,
  /revoke all on function public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text\s*\) from public/
);
assert.match(
  sql,
  /revoke all on function public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text\s*\) from anon/
);
assert.match(
  sql,
  /grant execute on function public\.list_public_sitters_search\(\s*text,\s*timestamptz,\s*timestamptz,\s*int,\s*numeric,\s*text,\s*numeric,\s*text,\s*text\s*\) to authenticated/
);
assert.match(sql, /notify pgrst, 'reload schema'/);

const migrationsDir = resolve(root, "supabase/migrations");
const laterCreates = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql") && name > "20260823002000_drop_obsolete_public_sitter_search_overload.sql")
  .filter((name) => {
    const body = readFileSync(resolve(migrationsDir, name), "utf8");
    return /create or replace function public\.list_public_sitters_search\(/.test(body);
  });
assert.deepEqual(laterCreates, [], "no later migration may recreate list_public_sitters_search");

const latestCreate = avatar.slice(avatar.lastIndexOf("create or replace function public.list_public_sitters_search("));
const header = latestCreate.slice(0, latestCreate.indexOf("returns jsonb"));
assert.match(header, /p_service_type text default null/);
assert.doesNotMatch(header, /p_parent_lat/);
assert.doesNotMatch(header, /p_parent_lng/);
assert.doesNotMatch(header, /p_max_distance_km/);
assert.match(header, /p_search_nanny_id text default null/);
assert.match(header, /p_search_city text default null/);

assert.match(
  latestCreate,
  /'avatar_url',\s*coalesce\(\s*nullif\(trim\(p\.avatar_url\), ''\),\s*nullif\(trim\(u\.raw_user_meta_data->>'avatar_url'\), ''\)/
);
assert.doesNotMatch(latestCreate, /u\.email/);
assert.doesNotMatch(
  latestCreate.slice(latestCreate.indexOf("jsonb_build_object("), latestCreate.indexOf("order by rt.avg_rating")),
  /'email'/
);

console.log("Obsolete public sitter search overload drop checks passed.");
