-- Didit KYC sessions + webhook idempotency.
-- Safe to re-run.

create table if not exists public.didit_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'parent'
    check (role in ('parent', 'sitter')),
  vendor_data text not null,
  workflow_id text not null,
  status text not null default 'Not Started'
    check (status in (
      'Not Started',
      'In Progress',
      'Awaiting User',
      'In Review',
      'Approved',
      'Declined',
      'Resubmitted',
      'Abandoned',
      'Expired',
      'Kyc Expired'
    )),
  decision jsonb,
  resubmit_info jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists didit_sessions_user_created_idx
  on public.didit_sessions (user_id, created_at desc);

create index if not exists didit_sessions_vendor_data_idx
  on public.didit_sessions (vendor_data);

create table if not exists public.didit_webhook_events (
  event_id text primary key,
  session_id uuid,
  webhook_type text,
  status text,
  processed_at timestamptz not null default now()
);

alter table public.didit_sessions enable row level security;
alter table public.didit_webhook_events enable row level security;

drop policy if exists didit_sessions_select_own on public.didit_sessions;
create policy didit_sessions_select_own
  on public.didit_sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists didit_sessions_insert_own on public.didit_sessions;
create policy didit_sessions_insert_own
  on public.didit_sessions for insert
  to authenticated
  with check (user_id = auth.uid() and vendor_data = auth.uid()::text);

revoke all on table public.didit_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.didit_webhook_events to service_role;

revoke all on table public.didit_sessions from anon;
revoke update, delete, truncate, references, trigger on table public.didit_sessions from authenticated;
grant select, insert on table public.didit_sessions to authenticated;

notify pgrst, 'reload schema';
