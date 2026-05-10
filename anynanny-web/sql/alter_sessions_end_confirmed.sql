-- Add end_confirmed (sitter acknowledged end request when completing session).
-- Run in Supabase SQL Editor if create_sessions_table.sql was applied earlier without this column.

alter table public.sessions
  add column if not exists end_confirmed boolean not null default false;

comment on column public.sessions.end_confirmed is 'Set true when sitter confirms end and session is finalized.';
