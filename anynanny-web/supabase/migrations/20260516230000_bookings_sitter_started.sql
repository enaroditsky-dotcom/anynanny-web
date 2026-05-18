-- Double-Shake stage 1: sitter marks arrival; parent confirms later.

alter table public.bookings
  add column if not exists actual_start_time timestamptz;

alter table public.bookings drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'sitter_started'));
