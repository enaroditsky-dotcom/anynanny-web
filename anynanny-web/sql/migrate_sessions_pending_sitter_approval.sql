-- Migrate legacy session status `pending` → `pending_sitter_approval` and tighten CHECK constraint.
-- Run once in Supabase SQL Editor after reviewing constraint names (optional: query pg_constraint).

update public.sessions
set status = 'pending_sitter_approval'
where status = 'pending';

alter table public.sessions
  drop constraint if exists sessions_status_check;

alter table public.sessions
  add constraint sessions_status_check
  check (status in ('pending_sitter_approval', 'active', 'completed'));
