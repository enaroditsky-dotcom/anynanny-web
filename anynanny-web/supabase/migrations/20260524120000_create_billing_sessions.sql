-- Billing phase: Double-Shake session tracking for minute-level billing.
-- Parent requests start/end; sitter confirms start; parent confirms end.
-- Run via Supabase CLI (`supabase db push`) or SQL Editor on a fresh project.
-- Replaces the demo sessions schema from sql/create_sessions_table.sql.

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
do $$
begin
  create type public.session_status as enum (
    'pending',
    'active',
    'completed',
    'disputed'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Table (clean slate for billing foundations)
-- ---------------------------------------------------------------------------
drop table if exists public.sessions cascade;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  parent_id uuid not null references public.profiles (id) on delete restrict,
  sitter_id uuid not null references public.profiles (id) on delete restrict,

  hourly_rate numeric(10, 2) not null check (hourly_rate > 0),

  -- Double-Shake timestamps
  start_time_requested timestamptz,
  start_time_confirmed_by_sitter timestamptz,
  end_time_requested timestamptz,
  end_time_confirmed_by_parent timestamptz,

  status public.session_status not null default 'pending',

  -- Populated when session completes (billable window = confirmed start → confirmed end)
  total_minutes integer check (total_minutes is null or total_minutes >= 0),
  total_amount numeric(12, 2) check (total_amount is null or total_amount >= 0),

  constraint sessions_distinct_participants check (parent_id <> sitter_id),
  constraint sessions_start_confirm_after_request check (
    start_time_confirmed_by_sitter is null
    or start_time_requested is null
    or start_time_confirmed_by_sitter >= start_time_requested
  ),
  constraint sessions_end_request_after_start check (
    end_time_requested is null
    or start_time_confirmed_by_sitter is null
    or end_time_requested >= start_time_confirmed_by_sitter
  ),
  constraint sessions_end_confirm_after_request check (
    end_time_confirmed_by_parent is null
    or end_time_requested is null
    or end_time_confirmed_by_parent >= end_time_requested
  ),
  constraint sessions_completed_requires_billing_fields check (
    status <> 'completed'
    or (
      start_time_confirmed_by_sitter is not null
      and end_time_confirmed_by_parent is not null
      and total_minutes is not null
      and total_amount is not null
    )
  )
);

comment on table public.sessions is
  'Double-Shake babysitting sessions: dual confirmation on start (sitter) and end (parent).';

comment on column public.sessions.start_time_requested is
  'Parent requested session start; awaiting sitter confirmation.';

comment on column public.sessions.start_time_confirmed_by_sitter is
  'Sitter confirmed start — billable clock begins.';

comment on column public.sessions.end_time_requested is
  'End requested (typically by parent); awaiting parent final confirmation.';

comment on column public.sessions.end_time_confirmed_by_parent is
  'Parent confirmed end — billable clock stops; triggers final billing.';

comment on column public.sessions.total_minutes is
  'Whole minutes between confirmed start and confirmed end (floor).';

comment on column public.sessions.total_amount is
  'Final charge: hourly_rate × (total_minutes / 60), rounded to 2 decimals.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index sessions_parent_id_created_at_idx
  on public.sessions (parent_id, created_at desc);

create index sessions_sitter_id_created_at_idx
  on public.sessions (sitter_id, created_at desc);

create index sessions_status_created_at_idx
  on public.sessions (status, created_at desc);

create index sessions_active_participants_idx
  on public.sessions (parent_id, sitter_id)
  where status in ('pending', 'active');

-- ---------------------------------------------------------------------------
-- updated_at trigger
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

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row
  execute function public.set_sessions_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;

create policy "sessions_select_participant"
  on public.sessions for select
  to authenticated
  using (auth.uid() = parent_id or auth.uid() = sitter_id);

create policy "sessions_insert_parent"
  on public.sessions for insert
  to authenticated
  with check (auth.uid() = parent_id);

create policy "sessions_update_participant"
  on public.sessions for update
  to authenticated
  using (auth.uid() = parent_id or auth.uid() = sitter_id)
  with check (auth.uid() = parent_id or auth.uid() = sitter_id);

-- ---------------------------------------------------------------------------
-- Realtime (optional — enables live Double-Shake UI sync)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.sessions;

notify pgrst, 'reload schema';
