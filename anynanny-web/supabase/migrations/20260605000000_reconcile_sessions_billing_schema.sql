-- Consolidated reconciliation of public.sessions for Double-Shake + minute-level billing.
--
-- Why this exists:
--   20260524120000_create_billing_sessions.sql does a destructive `drop table ... cascade`
--   and rebuilds `sessions` with an enum `status`, `hourly_rate NOT NULL`, and request/confirm
--   columns the client never uses. The client code (lib/session/*, lib/billing/*) instead expects
--   a free-text `status`, a `session_status` lifecycle column, Double-Shake timestamps, and the
--   minute-level billing columns. That mismatch is what produces `GET .../sessions 400 (Bad Request)`.
--
-- What this does:
--   Reconciles whatever state `sessions` is currently in (legacy demo table, enum-based clean slate,
--   or partially migrated) into the exact shape the client expects. NON-DESTRUCTIVE and fully
--   idempotent: safe to run repeatedly. No `drop table`, no data loss.

-- ---------------------------------------------------------------------------
-- 0. Table exists (never drop). Fresh installs get id + created_at; the rest is added below.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1. Core identity / linkage columns.
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists created_at timestamptz not null default now();
alter table public.sessions add column if not exists updated_at timestamptz not null default now();
alter table public.sessions add column if not exists parent_id  uuid;
alter table public.sessions add column if not exists sitter_id  uuid;
alter table public.sessions add column if not exists booking_id uuid;

-- The client always provides parent_id but treats sitter_id as optional, so sitter_id must be nullable.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
      and column_name = 'sitter_id' and is_nullable = 'NO'
  ) then
    alter table public.sessions alter column sitter_id drop not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. `status`: free-text workflow column (convert away from any enum type).
--    The client uses values like pending_sitter_approval / pending / active /
--    completed / cancelled that an enum would reject (the actual cause of the 400).
-- ---------------------------------------------------------------------------
do $$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name = 'status';

  if v_type is null then
    alter table public.sessions add column status text;
  elsif v_type <> 'text' then
    alter table public.sessions alter column status drop default;
    alter table public.sessions alter column status type text using status::text;
  end if;

  alter table public.sessions alter column status set default 'pending';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Double-Shake protocol timestamps + boolean flags expected by the client.
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists start_time               timestamptz;
alter table public.sessions add column if not exists end_time                 timestamptz;
alter table public.sessions add column if not exists start_confirmed          boolean not null default false;
alter table public.sessions add column if not exists end_requested            boolean not null default false;
alter table public.sessions add column if not exists end_confirmed            boolean not null default false;
alter table public.sessions add column if not exists parent_end_requested_at  timestamptz;
alter table public.sessions add column if not exists sitter_end_confirmed_at  timestamptz;

-- Explicit Double-Shake gesture timestamps.
alter table public.sessions add column if not exists sitter_start_shake timestamptz;
alter table public.sessions add column if not exists parent_start_shake timestamptz;
alter table public.sessions add column if not exists sitter_end_shake   timestamptz;
alter table public.sessions add column if not exists parent_end_shake   timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Minute-level billing columns.
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists final_elapsed_seconds    integer;
alter table public.sessions add column if not exists final_amount_nis         numeric(12, 2);
alter table public.sessions add column if not exists billing_rate_per_minute  numeric(10, 4);
alter table public.sessions add column if not exists total_amount_charged     numeric(12, 2);
alter table public.sessions add column if not exists stripe_payment_intent_id text;

-- ---------------------------------------------------------------------------
-- 5. `session_status` billing lifecycle column (widened to every value the client writes/reads).
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists session_status text not null default 'pending';

alter table public.sessions drop constraint if exists sessions_session_status_check;
alter table public.sessions
  add constraint sessions_session_status_check
  check (session_status in (
    'pending', 'confirmed', 'sitter_started', 'in_progress',
    'sitter_ended', 'active', 'completed', 'paid', 'cancelled', 'disputed'
  ));

-- ---------------------------------------------------------------------------
-- 6. Drop the clean-slate constraints that block the client's data model.
--    (hourly_rate-coupled completion gate, request/confirm ordering, distinct-participants,
--     and the NOT NULL on hourly_rate the client never sets.)
-- ---------------------------------------------------------------------------
alter table public.sessions drop constraint if exists sessions_completed_requires_billing_fields;
alter table public.sessions drop constraint if exists sessions_start_confirm_after_request;
alter table public.sessions drop constraint if exists sessions_end_request_after_start;
alter table public.sessions drop constraint if exists sessions_end_confirm_after_request;
alter table public.sessions drop constraint if exists sessions_distinct_participants;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sessions'
      and column_name = 'hourly_rate' and is_nullable = 'NO'
  ) then
    alter table public.sessions alter column hourly_rate drop not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Foreign keys for Double-Shake participants + linked booking.
--    Added NOT VALID so reconciliation never fails on pre-existing rows; the FK is enforced
--    for all new writes and is exposed to PostgREST for resource embedding either way.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'profiles') then
    if not exists (select 1 from pg_constraint where conname = 'sessions_parent_id_fkey') then
      alter table public.sessions
        add constraint sessions_parent_id_fkey
        foreign key (parent_id) references public.profiles (id) on delete restrict not valid;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'sessions_sitter_id_fkey') then
      alter table public.sessions
        add constraint sessions_sitter_id_fkey
        foreign key (sitter_id) references public.profiles (id) on delete restrict not valid;
    end if;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'bookings') then
    if not exists (select 1 from pg_constraint where conname = 'sessions_booking_id_fkey') then
      alter table public.sessions
        add constraint sessions_booking_id_fkey
        foreign key (booking_id) references public.bookings (id) on delete set null not valid;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Indexes used by the client's ordered lookups.
-- ---------------------------------------------------------------------------
create index if not exists sessions_parent_id_created_at_idx     on public.sessions (parent_id, created_at desc);
create index if not exists sessions_sitter_id_created_at_idx     on public.sessions (sitter_id, created_at desc);
create index if not exists sessions_status_created_at_idx        on public.sessions (status, created_at desc);
create index if not exists sessions_session_status_idx           on public.sessions (session_status, created_at desc);
create index if not exists sessions_booking_id_idx               on public.sessions (booking_id);
create index if not exists sessions_stripe_payment_intent_id_idx on public.sessions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- ---------------------------------------------------------------------------
-- 9. updated_at trigger.
-- ---------------------------------------------------------------------------
create or replace function public.set_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row
  execute function public.set_sessions_updated_at();

-- ---------------------------------------------------------------------------
-- 10. Row Level Security — participants can read/write their own sessions.
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;

drop policy if exists "sessions_select_participant" on public.sessions;
create policy "sessions_select_participant"
  on public.sessions for select
  to authenticated
  using (auth.uid() = parent_id or auth.uid() = sitter_id);

drop policy if exists "sessions_insert_parent" on public.sessions;
create policy "sessions_insert_parent"
  on public.sessions for insert
  to authenticated
  with check (auth.uid() = parent_id);

drop policy if exists "sessions_update_participant" on public.sessions;
create policy "sessions_update_participant"
  on public.sessions for update
  to authenticated
  using (auth.uid() = parent_id or auth.uid() = sitter_id)
  with check (auth.uid() = parent_id or auth.uid() = sitter_id);

-- ---------------------------------------------------------------------------
-- 11. Realtime publication (idempotent — ignore if already a member).
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Force PostgREST to reload the schema cache so the 400s clear immediately.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
