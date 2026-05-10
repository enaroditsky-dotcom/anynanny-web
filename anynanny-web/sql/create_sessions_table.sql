-- AnyNanny: sessions table + Realtime (run once in Supabase SQL Editor → New query → Run)

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  sitter_id uuid references auth.users (id) on delete set null,
  status text not null check (status in ('pending', 'active', 'completed')),
  start_time timestamptz,
  end_time timestamptz,
  final_elapsed_seconds integer,
  final_amount_nis numeric(12, 2),
  end_requested boolean not null default false,
  end_confirmed boolean not null default false,
  parent_end_requested_at timestamptz
);

create index if not exists sessions_parent_id_created_at_idx on public.sessions (parent_id, created_at desc);
create index if not exists sessions_status_created_at_idx on public.sessions (status, created_at desc);

alter table public.sessions enable row level security;

-- Adjust policies to your product rules; these allow authenticated clients to participate in the demo flow.
create policy "sessions_select_authenticated"
  on public.sessions for select
  to authenticated
  using (true);

create policy "sessions_insert_parent_self"
  on public.sessions for insert
  to authenticated
  with check (parent_id = auth.uid());

create policy "sessions_update_authenticated"
  on public.sessions for update
  to authenticated
  using (true)
  with check (true);

-- Broadcast row changes to Realtime subscribers (required for postgres_changes on this table).
alter publication supabase_realtime add table public.sessions;
