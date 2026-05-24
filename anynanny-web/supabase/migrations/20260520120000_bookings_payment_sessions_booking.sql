-- Stripe: booking payment tracking + link sessions to bookings for post-shift checkout.

alter table public.bookings
  add column if not exists payment_status text not null default 'unpaid';

alter table public.bookings drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('unpaid', 'pending_checkout', 'paid'));

alter table public.bookings
  add column if not exists paid_at timestamptz;

alter table public.bookings
  add column if not exists stripe_checkout_session_id text;

create index if not exists bookings_parent_payment_idx
  on public.bookings (parent_id, payment_status)
  where payment_status <> 'paid';

alter table public.sessions
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

create index if not exists sessions_booking_id_idx
  on public.sessions (booking_id)
  where booking_id is not null;

notify pgrst, 'reload schema';
