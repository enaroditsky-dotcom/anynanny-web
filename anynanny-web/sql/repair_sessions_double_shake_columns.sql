-- Repair missing Double-Shake columns on public.sessions (idempotent).
-- Run in Supabase SQL Editor. PostgREST reloads schema cache after NOTIFY.

alter table public.sessions
  add column if not exists end_requested boolean not null default false;

alter table public.sessions
  add column if not exists end_confirmed boolean not null default false;

alter table public.sessions
  add column if not exists start_confirmed boolean not null default false;

comment on column public.sessions.end_requested is 'Parent requested session end; sitter must confirm.';
comment on column public.sessions.end_confirmed is 'Sitter confirmed end when completing session.';
comment on column public.sessions.start_confirmed is 'Sitter confirmed start (shift officially active).';

-- Hint PostgREST / API schema cache refresh (Supabase-compatible).
notify pgrst, 'reload schema';
