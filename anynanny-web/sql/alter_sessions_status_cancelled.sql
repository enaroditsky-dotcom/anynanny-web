-- Allow parent-cancelled sessions + optional alias status for "waiting" state.
-- Run in Supabase SQL Editor after create_sessions_table / migrate_sessions_pending_sitter_approval.

alter table public.sessions drop constraint if exists sessions_status_check;

alter table public.sessions
  add constraint sessions_status_check
  check (
    status in (
      'pending_sitter_approval',
      'pending',
      'pending_confirmation',
      'active',
      'completed',
      'cancelled'
    )
  );

comment on column public.sessions.status is 'Lifecycle: pending*, active, completed, or cancelled (parent withdrew before sitter start).';
