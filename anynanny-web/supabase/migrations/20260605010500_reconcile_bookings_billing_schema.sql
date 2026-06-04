-- Reconcile public.bookings for Double-Shake session-end and billing synchronization.
--
-- Non-destructive and idempotent. This keeps the existing bookings history intact,
-- widens the status constraint to every value the app writes, and adds optional
-- live-shift / payment columns referenced by the billing integration.

alter table public.bookings
  add column if not exists actual_start_time timestamptz;

alter table public.bookings
  add column if not exists actual_end_time timestamptz;

alter table public.bookings
  add column if not exists requires_admin_review boolean not null default false;

alter table public.bookings
  add column if not exists admin_notes text;

alter table public.bookings
  add column if not exists payment_status text not null default 'unpaid';

alter table public.bookings
  add column if not exists paid_at timestamptz;

alter table public.bookings
  add column if not exists stripe_checkout_session_id text;

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (
    status in (
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'sitter_started',
      'parent_started',
      'sitter_ended',
      'completed'
    )
  );

alter table public.bookings
  drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('unpaid', 'pending_checkout', 'paid'));

create index if not exists bookings_admin_review_idx
  on public.bookings (requires_admin_review, updated_at desc)
  where requires_admin_review = true;

create index if not exists bookings_parent_payment_idx
  on public.bookings (parent_id, payment_status)
  where payment_status <> 'paid';

-- Parent dashboard advances its own booking during Double-Shake
-- (sitter_started -> parent_started, and completion sync paths).
alter table public.bookings enable row level security;

drop policy if exists bookings_update_parent on public.bookings;
create policy bookings_update_parent on public.bookings
  for update to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

notify pgrst, 'reload schema';
