-- Sitter confirms end with a timestamp (replaces relying on end_confirmed boolean alone).
alter table public.sessions
  add column if not exists sitter_end_confirmed_at timestamptz;

comment on column public.sessions.sitter_end_confirmed_at is 'Set when sitter confirms end; session row then moves to completed with end_time.';
