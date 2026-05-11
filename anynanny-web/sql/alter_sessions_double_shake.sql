-- Double-Shake: optional pairing + parent requests end before nanny confirms completion.
-- Run in Supabase SQL Editor after create_sessions_table.sql

alter table public.sessions
  add column if not exists end_requested boolean not null default false;

alter table public.sessions
  add column if not exists parent_end_requested_at timestamptz;

comment on column public.sessions.end_requested is 'Parent tapped end; nanny must confirm to finalize.';
comment on column public.sessions.parent_end_requested_at is 'When parent requested end (timer reference until nanny confirms).';

alter table public.sessions
  add column if not exists end_confirmed boolean not null default false;

comment on column public.sessions.end_confirmed is 'Sitter confirmed end when completing session.';

alter table public.sessions
  add column if not exists start_confirmed boolean not null default false;

comment on column public.sessions.start_confirmed is 'Sitter confirmed start when activating shift.';

notify pgrst, 'reload schema';
