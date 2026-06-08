-- Public Nanny ID system ("Shell" feature) — assigns a human-friendly, unique public
-- identifier (e.g. "Nanny-0001") to every nanny (profiles.role = 'sitter').
--
-- Scope / safety:
--   * ADDITIVE ONLY. Adds one nullable column + a sequence + two functions + one trigger.
--   * Does NOT change the primary key (profiles.id uuid) or any internal id logic.
--   * Does NOT touch the sessions or bookings tables, nor any atomic shift logic.
--   * Does NOT alter auth/login: the assignment piggybacks on whatever path sets
--     role = 'sitter' (handle_new_user trigger, role-selection upsert, ensureProfile, etc.).
--   * Fully isolated and idempotent (create ... if not exists / create or replace);
--     safe to run repeatedly with no data loss.
--
-- How "assigned on nanny registration" works:
--   A BEFORE INSERT OR UPDATE OF role trigger fires whenever a profile row is created or
--   its role changes. When the row is (or becomes) a 'sitter' and has no public id yet,
--   the trigger fills nanny_public_id. Parents are never assigned one.

-- ---------------------------------------------------------------------------
-- 1. Column: nanny_public_id (TEXT, UNIQUE). Nullable so parents/unassigned rows are fine.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists nanny_public_id text;

comment on column public.profiles.nanny_public_id is
  'Human-friendly public identifier for nannies (sitters), e.g. "Nanny-0001". Separate from the internal uuid PK and from sitter_profiles.nanny_serial.';

-- Partial UNIQUE index: enforce uniqueness only for assigned ids (NULLs do not collide).
create unique index if not exists profiles_nanny_public_id_key
  on public.profiles (nanny_public_id)
  where nanny_public_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Sequence backing the numeric part — guarantees collision-free increments.
-- ---------------------------------------------------------------------------
create sequence if not exists public.nanny_public_id_seq;

-- ---------------------------------------------------------------------------
-- 3. Generator function: returns the next unique "Nanny-XXXX" value.
--    SECURITY DEFINER so the existence check can see all rows (RLS would otherwise hide
--    other users' ids); the partial unique index is the ultimate guarantee.
-- ---------------------------------------------------------------------------
create or replace function public.generate_nanny_public_id()
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
    v_candidate := 'Nanny-' || lpad(nextval('public.nanny_public_id_seq')::text, 4, '0');
    -- Defensive: skip any value that already exists (e.g. manual backfills / retries).
    exit when not exists (
      select 1 from public.profiles where nanny_public_id = v_candidate
    );
  end loop;
  return v_candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger function: assign the id when a profile is/becomes a sitter without one.
-- ---------------------------------------------------------------------------
create or replace function public.assign_nanny_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'sitter'
     and (new.nanny_public_id is null or btrim(new.nanny_public_id) = '') then
    new.nanny_public_id := public.generate_nanny_public_id();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_nanny_public_id on public.profiles;
create trigger profiles_assign_nanny_public_id
  before insert or update of role on public.profiles
  for each row
  execute function public.assign_nanny_public_id();

-- ---------------------------------------------------------------------------
-- 5. One-time backfill for nannies that already exist without a public id.
-- ---------------------------------------------------------------------------
update public.profiles
   set nanny_public_id = public.generate_nanny_public_id()
 where role = 'sitter'
   and (nanny_public_id is null or btrim(nanny_public_id) = '');

-- ---------------------------------------------------------------------------
-- 6. Expose the new column/functions to PostgREST immediately.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
